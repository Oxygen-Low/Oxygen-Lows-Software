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
    public MainWindow()
    {
        InitializeComponent();
        Loaded += MainWindow_Loaded;
        Closing += MainWindow_Closing;
        
        SingleInstance.OnMessageReceived += SingleInstance_OnMessageReceived;
    }

    private void SingleInstance_OnMessageReceived(string message)
    {
        try
        {
            if (message.StartsWith("oxygenlows://"))
            {
                var uri = new Uri(message);
                if (webView != null && webView.CoreWebView2 != null)
                {
                    var currentOrigin = webView.Source.GetLeftPart(UriPartial.Authority);
                    var query = uri.Query;
                    var fragment = uri.Fragment;
                    webView.CoreWebView2.Navigate($"{currentOrigin}/auth/callback{query}{fragment}");
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("SingleInstance Message Error: " + ex.Message);
        }
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
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
    }
}
