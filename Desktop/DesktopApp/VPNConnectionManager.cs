using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace DesktopApp;

public static class VPNConnectionManager
{
    private static readonly HttpClient _client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
    
    private static TcpListener? _proxyListener;
    private static ClientWebSocket? _ws;
    private static CancellationTokenSource? _cts;
    private static readonly ConcurrentDictionary<string, TaskCompletionSource<JsonDocument>> _pendingRequests = new();
    private static readonly ConcurrentDictionary<string, TcpClient> _activeTunnels = new();
    private static readonly SemaphoreSlim _wsSendLock = new(1, 1);

    [DllImport("wininet.dll", SetLastError = true)]
    private static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
    private const int INTERNET_OPTION_SETTINGS_CHANGED = 39;
    private const int INTERNET_OPTION_REFRESH = 37;

    private static void SetSystemProxy(string? proxyAddress)
    {
        var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Internet Settings", true);
        if (key == null) return;
        if (proxyAddress != null)
        {
            key.SetValue("ProxyServer", proxyAddress);
            key.SetValue("ProxyEnable", 1);
        }
        else
        {
            key.SetValue("ProxyEnable", 0);
        }
        key.Close();
        InternetSetOption(IntPtr.Zero, INTERNET_OPTION_SETTINGS_CHANGED, IntPtr.Zero, 0);
        InternetSetOption(IntPtr.Zero, INTERNET_OPTION_REFRESH, IntPtr.Zero, 0);
    }

    public static async Task<string> FetchServerConfigAsync(string baseUrl)
    {
        try
        {
            var response = await _client.GetAsync(baseUrl);
            if (response.IsSuccessStatusCode)
            {
                return await response.Content.ReadAsStringAsync();
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"FetchServerConfig Exception: {ex.Message}");
        }
        return "";
    }

    public static async Task<bool> ConnectAsync(string baseUrl, string userId, string accessToken)
    {
        try
        {
            await DisconnectAsync();
            
            _cts = new CancellationTokenSource();
            _ws = new ClientWebSocket();
            
            string wsUrl = baseUrl.Replace("https://", "wss://").Replace("http://", "ws://");
            if (!wsUrl.EndsWith("/")) wsUrl += "/";
            
            await _ws.ConnectAsync(new Uri(wsUrl), _cts.Token);
            
            var authMsg = new
            {
                type = "auth",
                payload = new { user_id = userId, access_token = accessToken }
            };
            
            await SendWsMessageAsync(authMsg);
            
            var buffer = new byte[8192];
            var result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), _cts.Token);
            string responseStr = Encoding.UTF8.GetString(buffer, 0, result.Count);
            
            using var doc = JsonDocument.Parse(responseStr);
            if (!doc.RootElement.TryGetProperty("type", out var typeProp) || typeProp.GetString() != "auth_response")
            {
                return false;
            }
            if (!doc.RootElement.TryGetProperty("success", out var successProp) || !successProp.GetBoolean())
            {
                return false;
            }
            
            _proxyListener = new TcpListener(IPAddress.Parse("127.0.0.1"), 9090);
            _proxyListener.Start();
            
            _ = AcceptConnectionsAsync(_cts.Token);
            _ = ReceiveWsMessagesAsync(_cts.Token);
            
            SetSystemProxy("127.0.0.1:9090");
            
            return true;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"ConnectAsync Exception: {ex.Message}");
            return false;
        }
    }

    public static async Task DisconnectAsync()
    {
        try
        {
            SetSystemProxy(null);
            
            _cts?.Cancel();
            _cts?.Dispose();
            _cts = null;
            
            _proxyListener?.Stop();
            _proxyListener = null;
            
            if (_ws != null)
            {
                if (_ws.State == WebSocketState.Open)
                {
                    await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Disconnecting", CancellationToken.None);
                }
                _ws.Dispose();
                _ws = null;
            }
            
            foreach (var tunnel in _activeTunnels.Values)
            {
                tunnel.Close();
            }
            _activeTunnels.Clear();
            _pendingRequests.Clear();
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"DisconnectAsync Exception: {ex.Message}");
        }
    }

    private static async Task SendWsMessageAsync(object message)
    {
        if (_ws == null || _ws.State != WebSocketState.Open) return;
        
        await _wsSendLock.WaitAsync();
        try
        {
            string json = JsonSerializer.Serialize(message);
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            await _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
        }
        finally
        {
            _wsSendLock.Release();
        }
    }

    private static async Task AcceptConnectionsAsync(CancellationToken token)
    {
        try
        {
            while (!token.IsCancellationRequested && _proxyListener != null)
            {
                var client = await _proxyListener.AcceptTcpClientAsync(token);
                _ = HandleClientAsync(client, token);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            Debug.WriteLine($"AcceptConnectionsAsync Exception: {ex.Message}");
        }
    }

    private static async Task HandleClientAsync(TcpClient client, CancellationToken token)
    {
        try
        {
            var stream = client.GetStream();
            using var reader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
            string? line = await reader.ReadLineAsync(token);
            if (string.IsNullOrEmpty(line))
            {
                client.Close();
                return;
            }

            if (line.StartsWith("CONNECT "))
            {
                var parts = line.Split(' ');
                if (parts.Length < 2) { client.Close(); return; }
                
                string target = parts[1];
                var targetParts = target.Split(':');
                string host = targetParts[0];
                int port = targetParts.Length > 1 ? int.Parse(targetParts[1]) : 443;
                
                while (!string.IsNullOrEmpty(await reader.ReadLineAsync(token))) { }
                
                string id = Guid.NewGuid().ToString();
                var tcs = new TaskCompletionSource<JsonDocument>();
                _pendingRequests[id] = tcs;
                
                await SendWsMessageAsync(new { type = "tunnel_open", id, host, port });
                
                var response = await tcs.Task;
                _pendingRequests.TryRemove(id, out _);
                
                if (response.RootElement.TryGetProperty("type", out var t) && t.GetString() == "tunnel_opened")
                {
                    _activeTunnels[id] = client;
                    
                    byte[] okBytes = Encoding.ASCII.GetBytes("HTTP/1.1 200 Connection Established\r\n\r\n");
                    await stream.WriteAsync(okBytes, 0, okBytes.Length, token);
                    
                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            byte[] buffer = new byte[8192];
                            int bytesRead;
                            while ((bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length, token)) > 0)
                            {
                                string b64 = Convert.ToBase64String(buffer, 0, bytesRead);
                                await SendWsMessageAsync(new { type = "tunnel_data", id, data = b64 });
                            }
                        }
                        catch { }
                        finally
                        {
                            _activeTunnels.TryRemove(id, out _);
                            await SendWsMessageAsync(new { type = "tunnel_close", id });
                            client.Close();
                        }
                    }, token);
                }
                else
                {
                    client.Close();
                }
            }
            else
            {
                StringBuilder requestBuilder = new StringBuilder();
                requestBuilder.AppendLine(line);
                string? headerLine;
                int contentLength = 0;
                while (!string.IsNullOrEmpty(headerLine = await reader.ReadLineAsync(token)))
                {
                    requestBuilder.AppendLine(headerLine);
                    if (headerLine.StartsWith("Content-Length: ", StringComparison.OrdinalIgnoreCase))
                    {
                        int.TryParse(headerLine.Substring(16), out contentLength);
                    }
                }
                requestBuilder.AppendLine();
                
                byte[] bodyBytes = Array.Empty<byte>();
                if (contentLength > 0)
                {
                    bodyBytes = new byte[contentLength];
                    int totalRead = 0;
                    while (totalRead < contentLength)
                    {
                        int read = await stream.ReadAsync(bodyBytes, totalRead, contentLength - totalRead, token);
                        if (read == 0) break;
                        totalRead += read;
                    }
                }
                
                string id = Guid.NewGuid().ToString();
                var tcs = new TaskCompletionSource<JsonDocument>();
                _pendingRequests[id] = tcs;
                
                var parts = line.Split(' ');
                string method = parts[0];
                string url = parts[1];
                
                var headers = new Dictionary<string, string>();
                using var sr = new StringReader(requestBuilder.ToString());
                sr.ReadLine();
                string? h;
                while (!string.IsNullOrEmpty(h = sr.ReadLine()))
                {
                    int colonIdx = h.IndexOf(':');
                    if (colonIdx > 0)
                    {
                        headers[h.Substring(0, colonIdx).Trim()] = h.Substring(colonIdx + 1).Trim();
                    }
                }
                
                await SendWsMessageAsync(new
                {
                    type = "proxy_request",
                    id,
                    method,
                    url,
                    headers,
                    body = Convert.ToBase64String(bodyBytes)
                });
                
                var response = await tcs.Task;
                _pendingRequests.TryRemove(id, out _);
                
                if (response.RootElement.TryGetProperty("status", out var statusProp) && statusProp.ValueKind == JsonValueKind.Number)
                {
                    int statusCode = statusProp.GetInt32();
                    using var writer = new StreamWriter(stream, Encoding.ASCII, leaveOpen: true);
                    await writer.WriteAsync($"HTTP/1.1 {statusCode} OK\r\n");
                    if (response.RootElement.TryGetProperty("headers", out var resHeaders) && resHeaders.ValueKind == JsonValueKind.Object)
                    {
                        foreach (var hdr in resHeaders.EnumerateObject())
                        {
                            await writer.WriteAsync($"{hdr.Name}: {hdr.Value.GetString()}\r\n");
                        }
                    }
                    await writer.WriteAsync("\r\n");
                    await writer.FlushAsync();
                    
                    if (response.RootElement.TryGetProperty("body", out var resBody) && resBody.ValueKind == JsonValueKind.String)
                    {
                        string b64 = resBody.GetString() ?? "";
                        if (!string.IsNullOrEmpty(b64))
                        {
                            byte[] data = Convert.FromBase64String(b64);
                            await stream.WriteAsync(data, 0, data.Length, token);
                        }
                    }
                }
                client.Close();
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"HandleClientAsync Exception: {ex.Message}");
            client.Close();
        }
    }

    private static async Task ReceiveWsMessagesAsync(CancellationToken token)
    {
        var buffer = new byte[65536];
        try
        {
            while (!token.IsCancellationRequested && _ws != null && _ws.State == WebSocketState.Open)
            {
                using var ms = new MemoryStream();
                WebSocketReceiveResult result;
                do
                {
                    result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), token);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        await DisconnectAsync();
                        return;
                    }
                    ms.Write(buffer, 0, result.Count);
                }
                while (!result.EndOfMessage);
                
                ms.Position = 0;
                string msg = Encoding.UTF8.GetString(ms.ToArray());
                try
                {
                    using var doc = JsonDocument.Parse(msg);
                    if (doc.RootElement.TryGetProperty("type", out var typeProp))
                    {
                        string type = typeProp.GetString() ?? "";
                        string id = doc.RootElement.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "";
                        
                        if (type == "tunnel_opened" || type == "proxy_response" || type == "tunnel_error" || type == "proxy_error")
                        {
                            if (_pendingRequests.TryGetValue(id, out var tcs))
                            {
                                tcs.TrySetResult(JsonDocument.Parse(msg));
                            }
                        }
                        else if (type == "tunnel_data")
                        {
                            if (_activeTunnels.TryGetValue(id, out var client) && client.Connected)
                            {
                                string b64 = doc.RootElement.GetProperty("data").GetString() ?? "";
                                byte[] data = Convert.FromBase64String(b64);
                                await client.GetStream().WriteAsync(data, 0, data.Length, token);
                            }
                        }
                        else if (type == "tunnel_close")
                        {
                            if (_activeTunnels.TryRemove(id, out var client))
                            {
                                client.Close();
                            }
                        }
                    }
                }
                catch (Exception e)
                {
                    Debug.WriteLine("WS parse error: " + e.Message);
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            Debug.WriteLine($"ReceiveWsMessagesAsync Exception: {ex.Message}");
            await DisconnectAsync();
        }
    }
}
