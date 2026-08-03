using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace DesktopApp;

public partial class MainWindow : Window
{
    private TcpListener? _tcpListener;
    private CancellationTokenSource? _serverCts;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += MainWindow_Loaded;
        Closing += MainWindow_Closing;
    }

    private void StartLocalServer()
    {
        try
        {
            _tcpListener = new TcpListener(IPAddress.Loopback, 50321);
            _tcpListener.Start();
            _serverCts = new CancellationTokenSource();
            
            _ = Task.Run(async () =>
            {
                while (_serverCts != null && !_serverCts.Token.IsCancellationRequested)
                {
                    try
                    {
                        var client = await _tcpListener.AcceptTcpClientAsync(_serverCts.Token);
                        _ = HandleClientAsync(client);
                    }
                    catch (OperationCanceledException) { break; }
                    catch (Exception ex) { Debug.WriteLine("Accept Error: " + ex.Message); }
                }
            });
        }
        catch (Exception ex)
        {
            Debug.WriteLine("Failed to start TcpListener: " + ex.Message);
        }
    }

    private async Task HandleClientAsync(TcpClient client)
    {
        try
        {
            using (client)
            using (var stream = client.GetStream())
            using (var reader = new StreamReader(stream, System.Text.Encoding.ASCII, leaveOpen: true))
            {
                var requestLine = await reader.ReadLineAsync();
                if (string.IsNullOrEmpty(requestLine)) return;
                
                var parts = requestLine.Split(' ');
                if (parts.Length >= 2 && parts[0] == "GET")
                {
                    var pathAndQuery = parts[1];
                    var queryIndex = pathAndQuery.IndexOf('?');
                    if (queryIndex != -1)
                    {
                        var query = pathAndQuery.Substring(queryIndex);
                        Dispatcher.Invoke(() =>
                        {
                            try
                            {
                                if (webView != null && webView.CoreWebView2 != null)
                                {
                                    var currentOrigin = webView.Source.GetLeftPart(UriPartial.Authority);
                                    webView.CoreWebView2.Navigate($"{currentOrigin}/auth/callback{query}");
                                }
                            }
                            catch (Exception ex) { Debug.WriteLine("Nav error: " + ex.Message); }
                        });
                    }

                    string responseString = "<html><body style='font-family: sans-serif; text-align: center; margin-top: 50px;'><h2>Authentication successful!</h2><p>You can close this tab and return to the desktop app.</p><script>window.close();</script></body></html>";
                    byte[] bodyBytes = System.Text.Encoding.UTF8.GetBytes(responseString);
                    
                    var responseHeader = "HTTP/1.1 200 OK\r\n" +
                                         "Content-Type: text/html; charset=utf-8\r\n" +
                                         "Connection: close\r\n" +
                                         $"Content-Length: {bodyBytes.Length}\r\n" +
                                         "\r\n";
                    
                    byte[] headerBytes = System.Text.Encoding.ASCII.GetBytes(responseHeader);
                    
                    await stream.WriteAsync(headerBytes, 0, headerBytes.Length);
                    await stream.WriteAsync(bodyBytes, 0, bodyBytes.Length);
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("HandleClient Error: " + ex.Message);
        }
    }

    private void StopLocalServer()
    {
        try
        {
            _serverCts?.Cancel();
            _tcpListener?.Stop();
        }
        catch { }
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        StartLocalServer();

        var userDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OxygenLowsSoftware", "WebView2");
        var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
        await webView.EnsureCoreWebView2Async(environment);
        
        webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

        await Task.Delay(1000); 
        
        webView.CoreWebView2.Navigate("https://main.oxygen-lows-software.workers.dev/?desktop=1");
    }

    private async void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            string raw = e.TryGetWebMessageAsString();
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.TryGetProperty("command", out var cmdProp))
            {
                var cmd = cmdProp.GetString();
                
                if (cmd == "open_browser")
                {
                    string url = doc.RootElement.TryGetProperty("url", out var u) ? u.GetString() ?? "" : "";
                    if (!string.IsNullOrEmpty(url))
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = url,
                            UseShellExecute = true
                        });
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("WebMessage Error: " + ex.Message);
        }
    }

    private void SendWebMessage(object payload)
    {
        try
        {
            string json = JsonSerializer.Serialize(payload);
            webView.CoreWebView2.PostWebMessageAsJson(json);
        }
        catch { }
    }

    private void MainWindow_Closing(object? sender, CancelEventArgs e)
    {
        StopLocalServer();
    }
}
