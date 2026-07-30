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
    private Process? _nodeProcess;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += MainWindow_Loaded;
        Closing += MainWindow_Closing;
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        StartNodeServer();

        var userDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OxygenLowsSoftware", "WebView2");
        var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
        await webView.EnsureCoreWebView2Async(environment);
        
        webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

        // Give the node server a bit of time to start up before navigating
        await Task.Delay(2000); 
        
        webView.CoreWebView2.Navigate("http://localhost:3000?desktop=1");
    }

    private void StartNodeServer()
    {
        try
        {
            var exeDir = AppDomain.CurrentDomain.BaseDirectory;
            var installDir = Directory.GetParent(exeDir)?.FullName ?? exeDir;
            
            var nodeDir = Path.Combine(installDir, "node", "node-v20.15.0-win-x64");
            var repoDir = Path.Combine(installDir, "repo");
            
            // Fallback for development (running directly in repo)
            var npmCmd = Path.Combine(nodeDir, "npm.cmd");
            if (!File.Exists(npmCmd)) 
            {
                npmCmd = "npm.cmd";
                repoDir = Directory.GetParent(exeDir)?.Parent?.Parent?.Parent?.Parent?.FullName ?? repoDir;
            }

            Debug.WriteLine($"Starting node server from: {repoDir}");
            Debug.WriteLine($"npm command: {npmCmd}");

            var psi = new ProcessStartInfo
            {
                FileName = npmCmd,
                Arguments = "start",
                WorkingDirectory = repoDir,
                UseShellExecute = true,
                CreateNoWindow = true
            };
            
            _nodeProcess = Process.Start(psi);
            
            if (_nodeProcess != null)
            {
                Debug.WriteLine($"Node server process started with PID: {_nodeProcess.Id}");
            }
            else
            {
                Debug.WriteLine("Failed to start node server process");
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("Failed to start node server: " + ex.Message);
            Debug.WriteLine(ex.StackTrace);
        }
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

        // Terminate Node server
        if (_nodeProcess != null && !_nodeProcess.HasExited)
        {
            try
            {
                var killPsi = new ProcessStartInfo("taskkill", $"/T /F /PID {_nodeProcess.Id}")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                Process.Start(killPsi)?.WaitForExit();
            }
            catch { }
        }
    }
}
