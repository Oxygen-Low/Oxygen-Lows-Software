using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Security.Principal;
using Microsoft.Web.WebView2.Core;

namespace DesktopApp;

public partial class MainWindow : Window
{
    private string? _workingDirectory = Path.GetTempPath();

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
                    var currentOrigin = webView.Source?.GetLeftPart(UriPartial.Authority) ?? "https://oxygenlow.com";
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

        // Start isolated Python background server
        PythonServerManager.Instance.OnServerReady += (url) =>
        {
            Dispatcher.Invoke(() =>
            {
                SendWebMessage(new { @event = "python_server_ready", data = new { url, port = PythonServerManager.Instance.Port } });
            });
        };
        _ = PythonServerManager.Instance.StartAsync();

        await Task.Delay(1000); 
        
        string initialMessage = SingleInstance.InitialMessage ?? "";
        if (!string.IsNullOrEmpty(initialMessage) && initialMessage.StartsWith("oxygenlows://"))
        {
            var uri = new Uri(initialMessage);
            var query = uri.Query;
            var fragment = uri.Fragment;
            webView.CoreWebView2.Navigate($"https://oxygenlow.com/auth/callback{query}{fragment}");
        }
        else
        {
            webView.CoreWebView2.Navigate("https://oxygenlow.com/?desktop=1");
        }
    }

    private async void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            string raw = e.TryGetWebMessageAsString();
            using var doc = JsonDocument.Parse(raw);
            if (!doc.RootElement.TryGetProperty("command", out var cmdProp)) return;
            
            var cmd = cmdProp.GetString();
            string id = doc.RootElement.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? "" : "";

            try
            {
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
                    if (!string.IsNullOrEmpty(id)) SendWebMessage(new { id, success = true });
                }
                else if (cmd == "select_directory")
                {
                    string? selectedPath = null;
                    await System.Windows.Application.Current.Dispatcher.InvokeAsync(() =>
                    {
                        using var dialog = new System.Windows.Forms.FolderBrowserDialog();
                        if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                        {
                            selectedPath = dialog.SelectedPath;
                        }
                    });
                    
                    if (selectedPath != null)
                    {
                        _workingDirectory = selectedPath;
                        SendWebMessage(new { id, success = true, data = selectedPath });
                    }
                    else
                    {
                        SendWebMessage(new { id, success = false, error = "Canceled" });
                    }
                }
                else if (cmd == "read_file")
                {
                    string path = doc.RootElement.TryGetProperty("path", out var pProp) ? pProp.GetString() ?? "" : "";
                    string fullPath = GetValidatedPath(path);
                    
                    var fileInfo = new FileInfo(fullPath);
                    if (fileInfo.Exists && fileInfo.Length > 1024 * 1024)
                        throw new Exception("File too large (capped at 1MB)");
                        
                    string content = await File.ReadAllTextAsync(fullPath);
                    SendWebMessage(new { id, success = true, data = content });
                }
                else if (cmd == "write_file")
                {
                    string path = doc.RootElement.TryGetProperty("path", out var pProp) ? pProp.GetString() ?? "" : "";
                    string content = doc.RootElement.TryGetProperty("content", out var cProp) ? cProp.GetString() ?? "" : "";
                    string fullPath = GetValidatedPath(path);
                    
                    Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
                    await File.WriteAllTextAsync(fullPath, content);
                    SendWebMessage(new { id, success = true });
                }
                else if (cmd == "list_directory")
                {
                    string path = doc.RootElement.TryGetProperty("path", out var pProp) ? pProp.GetString() ?? "" : "";
                    string fullPath = string.IsNullOrEmpty(path) ? (_workingDirectory ?? throw new Exception("Working directory not set")) : GetValidatedPath(path);
                    
                    var dirInfo = new DirectoryInfo(fullPath);
                    var entries = dirInfo.GetFileSystemInfos().Take(1000).Select(x => new 
                    { 
                        name = x.Name, 
                        isDirectory = x.Attributes.HasFlag(FileAttributes.Directory) 
                    });
                    
                    SendWebMessage(new { id, success = true, data = entries });
                }
                else if (cmd == "run_command")
                {
                    if (_workingDirectory == null) throw new Exception("Working directory not set");
                    string commandLine = doc.RootElement.TryGetProperty("commandLine", out var clProp) ? clProp.GetString() ?? "" : "";
                    
                    var process = new Process
                    {
                        StartInfo = new ProcessStartInfo
                        {
                            FileName = "cmd.exe",
                            Arguments = $"/c {commandLine}",
                            WorkingDirectory = _workingDirectory,
                            RedirectStandardOutput = true,
                            RedirectStandardError = true,
                            UseShellExecute = false,
                            CreateNoWindow = true
                        }
                    };
                    
                    process.Start();
                    
                    var stdoutTask = process.StandardOutput.ReadToEndAsync();
                    var stderrTask = process.StandardError.ReadToEndAsync();
                    
                    try
                    {
                        await process.WaitForExitAsync(new CancellationTokenSource(30000).Token);
                    }
                    catch (TaskCanceledException)
                    {
                        process.Kill();
                        throw new Exception("Command timed out after 30 seconds");
                    }
                    
                    string stdout = await stdoutTask;
                    string stderr = await stderrTask;
                    
                    if (stdout.Length > 100 * 1024) stdout = stdout.Substring(0, 100 * 1024) + "... (truncated)";
                    if (stderr.Length > 100 * 1024) stderr = stderr.Substring(0, 100 * 1024) + "... (truncated)";
                    
                    SendWebMessage(new { id, success = true, data = new { stdout, stderr } });
                }
                else if (cmd == "search_files")
                {
                    string path = doc.RootElement.TryGetProperty("path", out var pProp) ? pProp.GetString() ?? "" : "";
                    string query = doc.RootElement.TryGetProperty("query", out var qProp) ? qProp.GetString() ?? "" : "";
                    string fullPath = string.IsNullOrEmpty(path) ? (_workingDirectory ?? throw new Exception("Working directory not set")) : GetValidatedPath(path);
                    
                    var results = await Task.Run(() =>
                    {
                        var res = new List<object>();
                        int count = 0;
                        
                        foreach (var file in Directory.EnumerateFiles(fullPath, "*.*", SearchOption.AllDirectories))
                        {
                            if (count >= 50) break;
                            
                            try
                            {
                                var lines = File.ReadLines(file);
                                int lineNum = 1;
                                foreach (var line in lines)
                                {
                                    if (line.Contains(query, StringComparison.OrdinalIgnoreCase))
                                    {
                                        res.Add(new { file = Path.GetRelativePath(_workingDirectory!, file), line = lineNum, content = line });
                                        count++;
                                        if (count >= 50) break;
                                    }
                                    lineNum++;
                                }
                            }
                            catch { /* Ignore unreadable files */ }
                        }
                        return res;
                    });
                    
                    SendWebMessage(new { id, success = true, data = results });
                }
                else if (cmd == "get_location")
                {
                    try
                    {
                        using var client = new System.Net.Http.HttpClient();
                        var json = await client.GetStringAsync("http://ip-api.com/json/");
                        var data = JsonSerializer.Deserialize<JsonElement>(json);
                        SendWebMessage(new { id, success = true, data = new { lat = data.GetProperty("lat").GetDouble(), lon = data.GetProperty("lon").GetDouble() } });
                    }
                    catch (Exception ex)
                    {
                        SendWebMessage(new { id, success = false, error = ex.Message });
                    }
                }
                else if (cmd == "is_admin")
                {
                    bool isAdmin = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
                    SendWebMessage(new { id, success = true, data = new { isAdmin } });
                }
                else if (cmd == "require_admin")
                {
                    bool isAdmin = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
                    if (!isAdmin)
                    {
                        var exeName = Process.GetCurrentProcess().MainModule?.FileName;
                        if (exeName != null)
                        {
                            var startInfo = new ProcessStartInfo(exeName)
                            {
                                Verb = "runas",
                                UseShellExecute = true
                            };
                            try
                            {
                                Process.Start(startInfo);
                                System.Windows.Application.Current.Dispatcher.Invoke(() => System.Windows.Application.Current.Shutdown());
                            }
                            catch (Win32Exception)
                            {
                                SendWebMessage(new { id, success = false, error = "admin_denied" });
                            }
                        }
                    }
                    else
                    {
                        SendWebMessage(new { id, success = true, data = new { isAdmin = true } });
                    }
                }
                else if (cmd == "get_python_server")
                {
                    SendWebMessage(new 
                    { 
                        id, 
                        success = true, 
                        data = new 
                        { 
                            isRunning = PythonServerManager.Instance.IsRunning,
                            port = PythonServerManager.Instance.Port,
                            url = PythonServerManager.Instance.ServerUrl,
                            status = PythonServerManager.Instance.Status,
                            error = PythonServerManager.Instance.LastError
                        } 
                    });
                }
                else if (cmd == "restart_python_server")
                {
                    PythonServerManager.Instance.Stop();
                    bool ok = await PythonServerManager.Instance.StartAsync();
                    SendWebMessage(new 
                    { 
                        id, 
                        success = ok, 
                        data = new 
                        { 
                            isRunning = PythonServerManager.Instance.IsRunning,
                            port = PythonServerManager.Instance.Port,
                            url = PythonServerManager.Instance.ServerUrl,
                            status = PythonServerManager.Instance.Status,
                            error = PythonServerManager.Instance.LastError
                        } 
                    });
                }
            }
            catch (Exception ex)
            {
                if (!string.IsNullOrEmpty(id))
                {
                    SendWebMessage(new { id, success = false, error = ex.Message });
                }
                else
                {
                    Debug.WriteLine("Command Error: " + ex.Message);
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine("WebMessage Error: " + ex.Message);
        }
    }

    private string GetValidatedPath(string path)
    {
        if (_workingDirectory == null) throw new Exception("Working directory not set");
        
        string fullPath = Path.GetFullPath(Path.Combine(_workingDirectory, path));
        string workingDirFull = Path.GetFullPath(_workingDirectory);
        if (!workingDirFull.EndsWith(Path.DirectorySeparatorChar.ToString()))
        {
            workingDirFull += Path.DirectorySeparatorChar;
        }
        
        if (!fullPath.StartsWith(workingDirFull, StringComparison.OrdinalIgnoreCase) && 
            !fullPath.Equals(Path.GetFullPath(_workingDirectory), StringComparison.OrdinalIgnoreCase))
        {
            throw new Exception("Path traversal detected");
        }
        return fullPath;
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
        PythonServerManager.Instance.Stop();
    }
}
