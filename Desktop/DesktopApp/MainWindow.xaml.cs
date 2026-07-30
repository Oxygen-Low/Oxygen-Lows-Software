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
    private bool _serverStarted = false;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += MainWindow_Loaded;
        Closing += MainWindow_Closing;
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        StartNodeServer();

        // Wait for the server to actually start before navigating
        if (!WaitForServerToStart())
        {
            Debug.WriteLine("Server failed to start within timeout period");
        }

        var userDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OxygenLowsSoftware", "WebView2");
        var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
        await webView.EnsureCoreWebView2Async(environment);
        
        webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

        // Give additional time for WebView2 to initialize
        await Task.Delay(1000); 
        
        webView.CoreWebView2.Navigate("http://localhost:3000?desktop=1");
    }

    private bool WaitForServerToStart(int timeoutSeconds = 30, int retryIntervalMs = 500)
    {
        var stopwatch = Stopwatch.StartNew();
        
        while (stopwatch.Elapsed.TotalSeconds < timeoutSeconds)
        {
            try
            {
                using var client = new System.Net.Sockets.TcpClient();
                client.Connect("127.0.0.1", 3000);
                
                if (client.Connected)
                {
                    Debug.WriteLine($"Server is ready on port 3000 after {stopwatch.Elapsed.TotalSeconds:F1f} seconds");
                    _serverStarted = true;
                    client.Close();
                    return true;
                }
            }
            catch
            {
                // Port not open yet, keep waiting
            }
            
            Thread.Sleep(retryIntervalMs);
        }
        
        Debug.WriteLine($"Server failed to start within {timeoutSeconds} seconds");
        return false;
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

            // We need to run npm start through cmd.exe because npm.cmd is a batch file
            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c cd /d \"{repoDir}\" && npm start",
                WorkingDirectory = repoDir,
                UseShellExecute = false,  // cmd.exe is an executable (.exe), so this works
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };
            
            _nodeProcess = Process.Start(psi);
            
            if (_nodeProcess != null)
            {
                Debug.WriteLine($"Node server process started with PID: {_nodeProcess.Id}");
                
                // Read output asynchronously to prevent deadlocks
                _nodeProcess.OutputDataReceived += (s, e) => 
                { 
                    if (!string.IsNullOrEmpty(e.Data))
                        Debug.WriteLine($"[Server Output] {e.Data}"); 
                };
                _nodeProcess.ErrorDataReceived += (s, e) => 
                { 
                    if (!string.IsNullOrEmpty(e.Data))
                        Debug.WriteLine($"[Server Error] {e.Data}"); 
                };
                
                _nodeProcess.BeginOutputReadLine();
                _nodeProcess.BeginErrorReadLine();
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
