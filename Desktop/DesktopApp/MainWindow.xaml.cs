using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Security.Principal;
using DesktopApp.Models;
using Microsoft.Web.WebView2.Core;

namespace DesktopApp;

public partial class MainWindow : Window
{
    private string? _workingDirectory = Path.GetTempPath();
    private static readonly HttpClient _localHttpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(2.5) };

    public MainWindow()
    {
        InitializeComponent();
        Loaded += MainWindow_Loaded;
        Closing += MainWindow_Closing;
        
        SingleInstance.OnMessageReceived += SingleInstance_OnMessageReceived;
        PreviewKeyDown += MainWindow_PreviewKeyDown;
        KeyDown += MainWindow_KeyDown;
    }

    private void MainWindow_PreviewKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == System.Windows.Input.Key.F11 || (e.Key == System.Windows.Input.Key.System && e.SystemKey == System.Windows.Input.Key.F11))
        {
            ToggleFullscreen();
            e.Handled = true;
        }
    }

    private void MainWindow_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == System.Windows.Input.Key.F11 || (e.Key == System.Windows.Input.Key.System && e.SystemKey == System.Windows.Input.Key.F11))
        {
            ToggleFullscreen();
            e.Handled = true;
        }
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
        var options = new CoreWebView2EnvironmentOptions
        {
            AdditionalBrowserArguments = "--allow-running-insecure-content --disable-web-security --allow-insecure-localhost --disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights"
        };
        var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder, options);
        await webView.EnsureCoreWebView2Async(environment);
        
        webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;
        webView.CoreWebView2.ContainsFullScreenElementChanged += CoreWebView2_ContainsFullScreenElementChanged;
        webView.PreviewKeyDown += MainWindow_PreviewKeyDown;
        webView.KeyDown += MainWindow_KeyDown;

        await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(@"
            window.addEventListener('keydown', (e) => {
                if (e.key === 'F11') {
                    e.preventDefault();
                    window.chrome?.webview?.postMessage(JSON.stringify({ command: 'toggle_fullscreen' }));
                }
            });
        ");

        // Start isolated Python background server
        PythonServerManager.Instance.OnServerReady += (url) =>
        {
            Dispatcher.Invoke(() =>
            {
                SendWebMessage(new { @event = "python_server_ready", data = new { url, port = PythonServerManager.Instance.Port } });
            });
        };
        _ = PythonServerManager.Instance.StartAsync();

        // Initialize Game Process Monitor
        GameProcessMonitor.Instance.SessionStarted += (session) =>
        {
            Dispatcher.Invoke(() =>
            {
                SendWebMessage(new
                {
                    @event = "game_session_started",
                    event_type = "game_session_started",
                    gameId = session.GameId,
                    title = session.Title,
                    platform = session.Platform,
                    startedAt = session.StartedAt.ToString("o"),
                    data = new
                    {
                        gameId = session.GameId,
                        title = session.Title,
                        platform = session.Platform,
                        startedAt = session.StartedAt.ToString("o")
                    }
                });
            });
        };

        GameProcessMonitor.Instance.PlaytimeTick += (session, deltaSeconds, totalSeconds) =>
        {
            Dispatcher.Invoke(() =>
            {
                SendWebMessage(new
                {
                    @event = "game_playtime_tick",
                    event_type = "game_playtime_tick",
                    gameId = session.GameId,
                    deltaSeconds = deltaSeconds,
                    totalSessionSeconds = totalSeconds,
                    data = new
                    {
                        gameId = session.GameId,
                        deltaSeconds = deltaSeconds,
                        totalSessionSeconds = totalSeconds
                    }
                });
            });
        };

        GameProcessMonitor.Instance.SessionEnded += (session, totalSeconds) =>
        {
            Dispatcher.Invoke(() =>
            {
                SendWebMessage(new
                {
                    @event = "game_session_ended",
                    event_type = "game_session_ended",
                    gameId = session.GameId,
                    totalSessionSeconds = totalSeconds,
                    endedAt = DateTime.UtcNow.ToString("o"),
                    data = new
                    {
                        gameId = session.GameId,
                        totalSessionSeconds = totalSeconds,
                        endedAt = DateTime.UtcNow.ToString("o")
                    }
                });
            });
        };
        _ = GameProcessMonitor.Instance.StartAsync();

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

    private void CoreWebView2_ContainsFullScreenElementChanged(object? sender, object e)
    {
        if (webView.CoreWebView2.ContainsFullScreenElement)
        {
            SetFullscreen(true);
        }
        else
        {
            SetFullscreen(false);
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
                else if (cmd == "fetch_local_models")
                {
                    var models = new System.Collections.Concurrent.ConcurrentBag<Dictionary<string, string>>();
                    var seen = new System.Collections.Concurrent.ConcurrentDictionary<string, byte>(StringComparer.OrdinalIgnoreCase);

                    void AddModel(string provider, string modelId)
                    {
                        if (string.IsNullOrWhiteSpace(modelId)) return;
                        string trimmed = modelId.Trim();
                        string key = $"{provider}:{trimmed}";
                        if (seen.TryAdd(key, 0))
                        {
                            models.Add(new Dictionary<string, string>
                            {
                                ["provider"] = provider,
                                ["model_id"] = trimmed
                            });
                        }
                    }

                    var tasks = new List<Task>();

                    async Task ProbeEndpointAsync(string url, Action<JsonDocument> parser)
                    {
                        try
                        {
                            using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(1200));
                            var response = await _localHttpClient.GetAsync(url, cts.Token);
                            if (response.IsSuccessStatusCode)
                            {
                                var res = await response.Content.ReadAsStringAsync(cts.Token);
                                using var resDoc = JsonDocument.Parse(res);
                                parser(resDoc);
                            }
                        }
                        catch { }
                    }

                    // 1. LM Studio (ports 1234 on 127.0.0.1 and localhost)
                    var lmStudioUrls = new[]
                    {
                        "http://127.0.0.1:1234/v1/models",
                        "http://localhost:1234/v1/models",
                        "http://127.0.0.1:1234/api/v0/models",
                        "http://localhost:1234/api/v0/models"
                    };
                    foreach (var url in lmStudioUrls)
                    {
                        tasks.Add(ProbeEndpointAsync(url, resDoc =>
                        {
                            if (resDoc.RootElement.TryGetProperty("data", out var dataProp) && dataProp.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var item in dataProp.EnumerateArray())
                                {
                                    if (item.TryGetProperty("type", out var typeProp) && typeProp.GetString() == "embeddings")
                                        continue;
                                    string? modelId = null;
                                    if (item.TryGetProperty("id", out var itemIdProp)) modelId = itemIdProp.GetString();
                                    else if (item.TryGetProperty("name", out var nameProp)) modelId = nameProp.GetString();
                                    else if (item.TryGetProperty("model", out var mProp)) modelId = mProp.GetString();
                                    else if (item.TryGetProperty("key", out var kProp)) modelId = kProp.GetString();

                                    if (!string.IsNullOrEmpty(modelId))
                                    {
                                        AddModel("local-lmstudio", modelId);
                                    }
                                }
                            }
                            else if (resDoc.RootElement.TryGetProperty("models", out var modelsProp) && modelsProp.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var item in modelsProp.EnumerateArray())
                                {
                                    string? modelId = null;
                                    if (item.TryGetProperty("id", out var itemIdProp)) modelId = itemIdProp.GetString();
                                    else if (item.TryGetProperty("name", out var nameProp)) modelId = nameProp.GetString();
                                    if (!string.IsNullOrEmpty(modelId))
                                    {
                                        AddModel("local-lmstudio", modelId);
                                    }
                                }
                            }
                            else if (resDoc.RootElement.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var item in resDoc.RootElement.EnumerateArray())
                                {
                                    string? modelId = null;
                                    if (item.TryGetProperty("id", out var itemIdProp)) modelId = itemIdProp.GetString();
                                    else if (item.TryGetProperty("name", out var nameProp)) modelId = nameProp.GetString();
                                    if (!string.IsNullOrEmpty(modelId))
                                    {
                                        AddModel("local-lmstudio", modelId);
                                    }
                                }
                            }
                        }));
                    }

                    // 2. Ollama (port 11434 on 127.0.0.1 and localhost)
                    var ollamaUrls = new[]
                    {
                        "http://127.0.0.1:11434/api/tags",
                        "http://localhost:11434/api/tags",
                        "http://127.0.0.1:11434/v1/models",
                        "http://localhost:11434/v1/models"
                    };
                    foreach (var url in ollamaUrls)
                    {
                        tasks.Add(ProbeEndpointAsync(url, resDoc =>
                        {
                            if (resDoc.RootElement.TryGetProperty("models", out var modelsProp) && modelsProp.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var item in modelsProp.EnumerateArray())
                                {
                                    string? modelId = null;
                                    if (item.TryGetProperty("name", out var nameProp)) modelId = nameProp.GetString();
                                    else if (item.TryGetProperty("model", out var mProp)) modelId = mProp.GetString();
                                    if (!string.IsNullOrEmpty(modelId))
                                    {
                                        AddModel("local-ollama", modelId);
                                    }
                                }
                            }
                            else if (resDoc.RootElement.TryGetProperty("data", out var dataProp) && dataProp.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var item in dataProp.EnumerateArray())
                                {
                                    string? modelId = null;
                                    if (item.TryGetProperty("id", out var itemIdProp)) modelId = itemIdProp.GetString();
                                    else if (item.TryGetProperty("name", out var nameProp)) modelId = nameProp.GetString();
                                    if (!string.IsNullOrEmpty(modelId))
                                    {
                                        AddModel("local-ollama", modelId);
                                    }
                                }
                            }
                        }));
                    }

                    // 3. Kobold / KoboldCPP (ports 5001 and 5000 on 127.0.0.1 and localhost)
                    var koboldUrls = new[]
                    {
                        "http://127.0.0.1:5001/api/v1/model",
                        "http://localhost:5001/api/v1/model",
                        "http://127.0.0.1:5000/api/v1/model",
                        "http://localhost:5000/api/v1/model",
                        "http://127.0.0.1:5001/v1/models",
                        "http://localhost:5001/v1/models"
                    };
                    foreach (var url in koboldUrls)
                    {
                        tasks.Add(ProbeEndpointAsync(url, resDoc =>
                        {
                            if (resDoc.RootElement.TryGetProperty("result", out var resProp))
                            {
                                string? modelId = resProp.GetString();
                                if (!string.IsNullOrEmpty(modelId))
                                {
                                    AddModel("local-kobold", modelId);
                                }
                            }
                            else if (resDoc.RootElement.TryGetProperty("data", out var dataProp) && dataProp.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var item in dataProp.EnumerateArray())
                                {
                                    string? modelId = null;
                                    if (item.TryGetProperty("id", out var itemIdProp)) modelId = itemIdProp.GetString();
                                    if (!string.IsNullOrEmpty(modelId))
                                    {
                                        AddModel("local-kobold", modelId);
                                    }
                                }
                            }
                        }));
                    }

                    await Task.WhenAll(tasks);
                    SendWebMessage(new { id, success = true, data = models.ToList() });
                }
                else if (cmd == "toggle_fullscreen")
                {
                    Dispatcher.Invoke(ToggleFullscreen);
                    SendWebMessage(new { id, success = true, data = new { isFullscreen = _isFullscreen } });
                }
                else if (cmd == "set_fullscreen")
                {
                    bool fs = doc.RootElement.TryGetProperty("fullscreen", out var fsProp) && fsProp.GetBoolean();
                    Dispatcher.Invoke(() => SetFullscreen(fs));
                    SendWebMessage(new { id, success = true, data = new { isFullscreen = _isFullscreen } });
                }
                else if (cmd == "is_fullscreen")
                {
                    SendWebMessage(new { id, success = true, data = new { isFullscreen = _isFullscreen } });
                }
                else if (cmd == "scan_installed_games")
                {
                    var games = await GameScannerService.ScanAllAsync();
                    GameProcessMonitor.Instance.RegisterGames(games);
                    SendWebMessage(new { id, success = true, data = new { games } });
                }
                else if (cmd == "launch_game")
                {
                    string gameId = doc.RootElement.TryGetProperty("gameId", out var gIdProp) ? gIdProp.GetString() ?? "" : "";
                    string platform = doc.RootElement.TryGetProperty("platform", out var pProp) ? pProp.GetString() ?? "" : "";
                    string? title = doc.RootElement.TryGetProperty("title", out var tProp) ? tProp.GetString() : null;
                    string? launchUri = doc.RootElement.TryGetProperty("launchUri", out var luProp) ? luProp.GetString() : null;
                    string? executablePath = doc.RootElement.TryGetProperty("executablePath", out var epProp) ? epProp.GetString() : null;
                    string? arguments = doc.RootElement.TryGetProperty("arguments", out var aProp) ? aProp.GetString() : null;
                    string? workingDirectory = doc.RootElement.TryGetProperty("workingDirectory", out var wdProp) ? wdProp.GetString() : null;
                    string? executableName = doc.RootElement.TryGetProperty("executableName", out var enProp) ? enProp.GetString() : null;

                    var req = new LaunchGameRequest
                    {
                        GameId = gameId,
                        Platform = platform,
                        Title = title,
                        LaunchUri = launchUri,
                        ExecutablePath = executablePath,
                        Arguments = arguments,
                        WorkingDirectory = workingDirectory,
                        ExecutableName = executableName
                    };

                    var result = await GameProcessMonitor.Instance.LaunchGameAsync(req);
                    SendWebMessage(new { id, success = result.Success, data = new { success = result.Success, message = result.Message, processId = result.ProcessId } });
                }
                else if (cmd == "pick_game_executable")
                {
                    PickGameResult? pickResult = null;
                    await System.Windows.Application.Current.Dispatcher.InvokeAsync(() =>
                    {
                        using var dialog = new System.Windows.Forms.OpenFileDialog
                        {
                            Title = "Select Game Executable",
                            Filter = "Executable Files (*.exe)|*.exe|All Files (*.*)|*.*",
                            Multiselect = false,
                            CheckFileExists = true
                        };

                        if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK && !string.IsNullOrEmpty(dialog.FileName))
                        {
                            var exePath = dialog.FileName;
                            string gameTitle = Path.GetFileNameWithoutExtension(exePath);
                            try
                            {
                                var fileVersion = FileVersionInfo.GetVersionInfo(exePath);
                                if (!string.IsNullOrWhiteSpace(fileVersion.FileDescription))
                                {
                                    gameTitle = fileVersion.FileDescription.Trim();
                                }
                                else if (!string.IsNullOrWhiteSpace(fileVersion.ProductName))
                                {
                                    gameTitle = fileVersion.ProductName.Trim();
                                }
                            }
                            catch { }

                            var iconDataUrl = GameIconExtractor.ExtractIconAsDataUrl(exePath);

                            pickResult = new PickGameResult
                            {
                                Title = gameTitle,
                                ExecutablePath = exePath,
                                IconDataUrl = iconDataUrl
                            };
                        }
                    });

                    SendWebMessage(new { id, success = true, data = pickResult });
                }
                else if (cmd == "get_game_icon")
                {
                    string exePath = doc.RootElement.TryGetProperty("executablePath", out var ep) ? ep.GetString() ?? "" : "";
                    string? gameId = doc.RootElement.TryGetProperty("gameId", out var gi) ? gi.GetString() : null;

                    var iconDataUrl = await GameIconExtractor.ExtractIconAsDataUrlAsync(exePath, gameId);
                    SendWebMessage(new { id, success = true, data = new { iconDataUrl } });
                }
                else if (cmd == "get_running_games")
                {
                    var sessions = GameProcessMonitor.Instance.GetRunningSessions();
                    var runningGames = sessions.Select(s => new
                    {
                        gameId = s.GameId,
                        title = s.Title,
                        platform = s.Platform,
                        elapsedSeconds = s.ElapsedSeconds,
                        totalSessionSeconds = s.TotalSessionSeconds,
                        startedAt = s.StartedAt.ToString("o")
                    }).ToList();

                    SendWebMessage(new { id, success = true, data = new { runningGames } });
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

    private bool _isFullscreen = false;
    private WindowState _previousWindowState = WindowState.Normal;
    private WindowStyle _previousWindowStyle = WindowStyle.SingleBorderWindow;
    private ResizeMode _previousResizeMode = ResizeMode.CanResize;
    private DateTime _lastToggleTime = DateTime.MinValue;

    private void SetFullscreen(bool fullscreen)
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.Invoke(() => SetFullscreen(fullscreen));
            return;
        }

        if (_isFullscreen == fullscreen) return;
        ToggleFullscreen();
    }

    private void ToggleFullscreen()
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.Invoke(ToggleFullscreen);
            return;
        }

        if ((DateTime.UtcNow - _lastToggleTime).TotalMilliseconds < 250)
            return;
        _lastToggleTime = DateTime.UtcNow;

        if (!_isFullscreen)
        {
            _previousWindowState = WindowState;
            _previousWindowStyle = WindowStyle;
            _previousResizeMode = ResizeMode;

            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            if (WindowState == WindowState.Maximized)
            {
                WindowState = WindowState.Normal;
            }
            WindowState = WindowState.Maximized;
            _isFullscreen = true;
        }
        else
        {
            WindowStyle = _previousWindowStyle;
            ResizeMode = _previousResizeMode;
            WindowState = _previousWindowState == WindowState.Minimized ? WindowState.Normal : _previousWindowState;
            _isFullscreen = false;
        }
    }

    private void MainWindow_Closing(object? sender, CancelEventArgs e)
    {
        GameProcessMonitor.Instance.Stop();
        PythonServerManager.Instance.Stop();
    }
}
