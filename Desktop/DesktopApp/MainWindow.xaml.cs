using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
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
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        var userDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OxygenLowsSoftware", "WebView2");
        var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
        await webView.EnsureCoreWebView2Async(environment);
        
        webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

        // Give additional time for WebView2 to initialize
        await Task.Delay(1000); 
        
        webView.CoreWebView2.Navigate("https://oxygen-lows-software.onrender.com/?desktop=1");
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
                
                if (cmd == "vpn_connect")
                {
                    string serverName = doc.RootElement.GetProperty("serverName").GetString() ?? "";
                    string baseUrl = doc.RootElement.GetProperty("baseUrl").GetString() ?? "";
                    string configData = await VPNConnectionManager.FetchServerConfigAsync(baseUrl);
                    
                    if (!string.IsNullOrEmpty(configData))
                    {
                        VPNConnectionManager.CreateOrUpdateVPNProfile(serverName, baseUrl);
                        await VPNConnectionManager.ConnectAsync(serverName, "dummy_user", "dummy_token");
                        SendWebMessage(new { type = "vpn_status", status = "connected", serverName });
                    }
                    else
                    {
                        SendWebMessage(new { type = "vpn_status", status = "error", error = "Failed to fetch config" });
                    }
                }
                else if (cmd == "vpn_disconnect")
                {
                    string serverName = doc.RootElement.GetProperty("serverName").GetString() ?? "";
                    await VPNConnectionManager.DisconnectAsync(serverName);
                    SendWebMessage(new { type = "vpn_status", status = "disconnected" });
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("WebMessage Error: " + ex.Message);
            SendWebMessage(new { type = "vpn_status", status = "error", error = ex.Message });
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
        // Disconnect VPN on exit just in case
        try
        {
            VPNKillswitchManager.CleanUpActiveRulesOnExit();
        }
        catch { }
    }
}
