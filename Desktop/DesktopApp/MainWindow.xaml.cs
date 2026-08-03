using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace DesktopApp;

public partial class MainWindow : Window
{
    private HttpListener? _httpListener;

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
            _httpListener = new HttpListener();
            _httpListener.Prefixes.Add("http://localhost:50321/");
            _httpListener.Start();

            _ = Task.Run(async () =>
            {
                while (_httpListener != null && _httpListener.IsListening)
                {
                    try
                    {
                        var context = await _httpListener.GetContextAsync();
                        var request = context.Request;
                        var response = context.Response;

                        var query = request.Url?.Query;
                        if (!string.IsNullOrEmpty(query))
                        {
                            Dispatcher.Invoke(() =>
                            {
                                try
                                {
                                    if (webView != null && webView.CoreWebView2 != null)
                                    {
                                        var currentOrigin = webView.Source.GetLeftPart(UriPartial.Authority);
                                        webView.CoreWebView2.Navigate($"{currentOrigin}/auth{query}");
                                    }
                                }
                                catch (Exception ex)
                                {
                                    Debug.WriteLine("Navigation Error: " + ex.Message);
                                }
                            });
                        }

                        string responseString = "<html><body style='font-family: sans-serif; text-align: center; margin-top: 50px;'><h2>Authentication successful!</h2><p>You can close this tab and return to the desktop app.</p></body></html>";
                        byte[] buffer = System.Text.Encoding.UTF8.GetBytes(responseString);
                        response.ContentLength64 = buffer.Length;
                        using var output = response.OutputStream;
                        await output.WriteAsync(buffer, 0, buffer.Length);
                    }
                    catch (HttpListenerException)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine("HttpListener Exception: " + ex.Message);
                    }
                }
            });
        }
        catch (Exception ex)
        {
            Debug.WriteLine("Failed to start HttpListener: " + ex.Message);
        }
    }

    private void StopLocalServer()
    {
        try
        {
            if (_httpListener != null)
            {
                _httpListener.Stop();
                _httpListener.Close();
                _httpListener = null;
            }
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
