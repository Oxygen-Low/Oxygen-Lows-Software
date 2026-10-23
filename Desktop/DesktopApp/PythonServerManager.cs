using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace DesktopApp;

public class PythonServerManager
{
    private static readonly Lazy<PythonServerManager> _instance = new(() => new PythonServerManager());
    public static PythonServerManager Instance => _instance.Value;

    public const int DefaultPort = 54123;
    private Process? _serverProcess;
    private readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromMinutes(10) };
    private readonly SemaphoreSlim _startLock = new(1, 1);
    private TaskCompletionSource<bool>? _readyTcs;

    public string AuthToken { get; private set; } = "";

    public bool IsRunning { get; private set; }
    public int Port { get; private set; } = DefaultPort;
    public string ServerUrl => $"http://127.0.0.1:{Port}";
    public string VenvPath { get; }
    public string Status { get; private set; } = "NotStarted";
    public string? LastError { get; private set; }

    public event Action<string>? OnStatusChanged;
    public event Action<string>? OnServerReady;

    private PythonServerManager()
    {
        VenvPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "OxygenLowsSoftware",
            "PythonEnv"
        );
    }

    private void SetStatus(string status, string? error = null)
    {
        Status = status;
        if (error != null) LastError = error;
        Debug.WriteLine($"[PythonServerManager] Status: {status}" + (error != null ? $" | Error: {error}" : ""));
        OnStatusChanged?.Invoke(status);
    }

    private void CleanupOrphanedPythonProcesses()
    {
        try
        {
            string venvScript = Path.Combine(VenvPath, "Scripts", "python.exe");
            foreach (var proc in Process.GetProcessesByName("python"))
            {
                try
                {
                    string? mainModule = null;
                    try { mainModule = proc.MainModule?.FileName; } catch { }
                    if (!string.IsNullOrEmpty(mainModule) &&
                        string.Equals(Path.GetFullPath(mainModule), Path.GetFullPath(venvScript), StringComparison.OrdinalIgnoreCase))
                    {
                        proc.Kill(entireProcessTree: true);
                    }
                }
                catch { }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[PythonServerManager] CleanupOrphanedPythonProcesses error: {ex.Message}");
        }
    }

    public async Task<bool> StartAsync()
    {
        await _startLock.WaitAsync();
        try
        {
            if (IsRunning && _serverProcess != null && !_serverProcess.HasExited)
            {
                bool isStillHealthy = await PollHealthCheckAsync(TimeSpan.FromSeconds(1));
                if (isStillHealthy)
                {
                    return true;
                }
            }

            // Ensure any previous process or orphan is cleaned up
            Stop();
            Port = DefaultPort;

            SetStatus("Initializing");

            // Locate server script
            string serverScriptPath = FindServerScriptPath();
            if (!File.Exists(serverScriptPath))
            {
                SetStatus("Failed", $"server.py not found at {serverScriptPath}");
                return false;
            }

            // Ensure isolated venv is ready
            string? pythonExecutable = await EnsureVirtualEnvironmentAsync();
            if (string.IsNullOrEmpty(pythonExecutable) || !File.Exists(pythonExecutable))
            {
                SetStatus("Failed", "Could not prepare isolated Python virtual environment.");
                return false;
            }

            // Install/check dependencies from requirements.txt if present
            await EnsureRequirementsInstalledAsync(pythonExecutable, Path.GetDirectoryName(serverScriptPath)!);

            // Start Python server process
            SetStatus("StartingServer");
            _readyTcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

            string canonicalPython = Path.GetFullPath(pythonExecutable);
            string canonicalScript = Path.GetFullPath(serverScriptPath);

            var startInfo = new ProcessStartInfo
            {
                FileName = canonicalPython,
                WorkingDirectory = Path.GetDirectoryName(canonicalScript)!,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                RedirectStandardInput = true
            };

            startInfo.ArgumentList.Add("-u");
            startInfo.ArgumentList.Add(canonicalScript);
            startInfo.ArgumentList.Add("--parent-pid");
            startInfo.ArgumentList.Add(Environment.ProcessId.ToString());
            startInfo.ArgumentList.Add("--port");
            startInfo.ArgumentList.Add(Port.ToString());
            startInfo.ArgumentList.Add("--watch-stdin");

            AuthToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", AuthToken);
            startInfo.Environment["OXYGEN_PYTHON_TOKEN"] = AuthToken;
            startInfo.Environment["PYTHONUNBUFFERED"] = "1";

            _serverProcess = new Process { StartInfo = startInfo, EnableRaisingEvents = true };

            _serverProcess.OutputDataReceived += (s, e) =>
            {
                if (string.IsNullOrEmpty(e.Data)) return;
                Debug.WriteLine($"[PythonServer:out] {e.Data}");

                if (e.Data.StartsWith("READY:"))
                {
                    var parts = e.Data.Split(':');
                    if (parts.Length >= 2 && int.TryParse(parts[1], out int boundPort))
                    {
                        Port = boundPort;
                    }
                    _readyTcs?.TrySetResult(true);
                }
            };

            _serverProcess.ErrorDataReceived += (s, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    Debug.WriteLine($"[PythonServer:err] {e.Data}");
                }
            };

            _serverProcess.Exited += (s, e) =>
            {
                IsRunning = false;
                SetStatus("Stopped");
                _readyTcs?.TrySetResult(false);
            };

            if (!_serverProcess.Start())
            {
                SetStatus("Failed", "Failed to start Python process.");
                return false;
            }

            // Bind to Windows Job Object so child process dies if host terminates/crashes
            JobObjectHelper.AddProcess(_serverProcess);

            _serverProcess.BeginOutputReadLine();
            _serverProcess.BeginErrorReadLine();

            // Wait for handshake or health check
            var readyTask = _readyTcs.Task;
            var timeoutTask = Task.Delay(15000);

            var completedTask = await Task.WhenAny(readyTask, timeoutTask);
            if (completedTask == readyTask && await readyTask)
            {
                // Verify with health check
                bool healthy = await PollHealthCheckAsync(TimeSpan.FromSeconds(5));
                if (healthy)
                {
                    IsRunning = true;
                    SetStatus("Running");
                    OnServerReady?.Invoke(ServerUrl);
                    return true;
                }
            }

            try
            {
                if (_serverProcess != null && !_serverProcess.HasExited)
                {
                    _serverProcess.Kill(entireProcessTree: true);
                    _serverProcess.Dispose();
                    _serverProcess = null;
                }
            }
            catch { }

            SetStatus("Failed", "Timed out waiting for Python server handshake.");
            return false;
        }
        catch (Exception ex)
        {
            try
            {
                if (_serverProcess != null && !_serverProcess.HasExited)
                {
                    _serverProcess.Kill(entireProcessTree: true);
                    _serverProcess.Dispose();
                    _serverProcess = null;
                }
            }
            catch { }
            SetStatus("Failed", ex.Message);
            return false;
        }
        finally
        {
            _startLock.Release();
        }
    }

    public void Stop()
    {
        try
        {
            if (_serverProcess != null && !_serverProcess.HasExited)
            {
                try
                {
                    // Attempt graceful shutdown
                    using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));
                    using var req = new HttpRequestMessage(HttpMethod.Post, $"{ServerUrl}/shutdown");
                    req.Content = new StringContent("{}", Encoding.UTF8, "application/json");
                    req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", AuthToken);
                    _ = _httpClient.SendAsync(req, cts.Token);
                    _serverProcess.StandardInput.Close();
                }
                catch { }

                if (!_serverProcess.WaitForExit(1000))
                {
                    _serverProcess.Kill(entireProcessTree: true);
                }

                _serverProcess.Dispose();
                _serverProcess = null;
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[PythonServerManager] Error stopping server: {ex.Message}");
        }
        finally
        {
            CleanupOrphanedPythonProcesses();
            Port = DefaultPort;
            IsRunning = false;
            SetStatus("Stopped");
        }
    }

    public async Task<(bool Success, JsonElement Data, string? Error)> CallActionAsync(string appId, string action, string jsonParams)
    {
        if (!IsRunning)
        {
            return (false, default, $"Python server is not running (status: {Status})");
        }

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"{ServerUrl}/api/apps/{appId}/{action}");
            request.Content = new StringContent(jsonParams, Encoding.UTF8, "application/json");
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", AuthToken);

            var res = await _httpClient.SendAsync(request);
            string responseText = await res.Content.ReadAsStringAsync();

            if (!res.IsSuccessStatusCode)
            {
                return (false, default, $"Python server returned {res.StatusCode}: {responseText}");
            }

            using var doc = JsonDocument.Parse(responseText);
            var root = doc.RootElement.Clone();
            if (root.TryGetProperty("data", out var dataEl))
            {
                return (true, dataEl.Clone(), null);
            }
            return (true, root, null);
        }
        catch (Exception ex)
        {
            return (false, default, ex.Message);
        }
    }

    private async Task<bool> PollHealthCheckAsync(TimeSpan timeout)
    {
        using var cts = new CancellationTokenSource(timeout);
        while (!cts.Token.IsCancellationRequested)
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Get, $"{ServerUrl}/health");
                req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", AuthToken);
                var response = await _httpClient.SendAsync(req, cts.Token);
                if (response.IsSuccessStatusCode)
                {
                    return true;
                }
            }
            catch
            {
                try { await Task.Delay(200, cts.Token); } catch { break; }
            }
        }
        return false;
    }

    private string FindServerScriptPath()
    {
        // 1. App domain base directory
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string path1 = Path.Combine(baseDir, "PythonServer", "server.py");
        if (File.Exists(path1)) return path1;

        // 2. Direct server.py in base directory
        string path2 = Path.Combine(baseDir, "server.py");
        if (File.Exists(path2)) return path2;

        // 3. Source directory fallback during development
        string projectDir = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "PythonServer", "server.py"));
        if (File.Exists(projectDir)) return projectDir;

        return path1;
    }

    private async Task<string?> EnsureVirtualEnvironmentAsync()
    {
        string venvPython = Path.Combine(VenvPath, "Scripts", "python.exe");
        if (File.Exists(venvPython))
        {
            return venvPython;
        }

        SetStatus("CreatingVirtualEnv");
        string? systemPython = FindSystemPython();
        if (string.IsNullOrEmpty(systemPython))
        {
            Debug.WriteLine("[PythonServerManager] No system Python installation found.");
            return null;
        }

        string canonicalSystemPython = Path.GetFullPath(systemPython);
        if (!File.Exists(canonicalSystemPython) || !canonicalSystemPython.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        Directory.CreateDirectory(Path.GetDirectoryName(VenvPath)!);

        var venvProcess = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = canonicalSystemPython,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            }
        };

        venvProcess.StartInfo.ArgumentList.Add("-m");
        venvProcess.StartInfo.ArgumentList.Add("venv");
        venvProcess.StartInfo.ArgumentList.Add(Path.GetFullPath(VenvPath));

        venvProcess.Start();
        var venvOutTask = venvProcess.StandardOutput.ReadToEndAsync();
        var venvErrTask = venvProcess.StandardError.ReadToEndAsync();
        await Task.WhenAll(venvOutTask, venvErrTask, venvProcess.WaitForExitAsync());

        if (venvProcess.ExitCode == 0 && File.Exists(venvPython))
        {
            return venvPython;
        }

        return null;
    }

    private async Task EnsureRequirementsInstalledAsync(string pythonExecutable, string serverDir)
    {
        string reqFile = Path.Combine(serverDir, "requirements.txt");
        if (!File.Exists(reqFile)) return;

        string content = await File.ReadAllTextAsync(reqFile);
        if (string.IsNullOrWhiteSpace(content)) return;

        string hashFile = Path.Combine(VenvPath, ".requirements_hash");
        string currentHash = ComputeStringHash(content);

        if (File.Exists(hashFile))
        {
            string savedHash = await File.ReadAllTextAsync(hashFile);
            if (savedHash.Trim() == currentHash)
            {
                return; // Already up to date
            }
        }

        SetStatus("InstallingDependencies");
        string canonicalPython = Path.GetFullPath(pythonExecutable);
        if (!File.Exists(canonicalPython) || !canonicalPython.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"Invalid Python executable path: {canonicalPython}");
        }

        string canonicalReqFile = Path.GetFullPath(reqFile);
        if (!File.Exists(canonicalReqFile))
        {
            throw new FileNotFoundException("requirements.txt not found", canonicalReqFile);
        }

        var pipProcess = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = canonicalPython,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            }
        };

        pipProcess.StartInfo.ArgumentList.Add("-m");
        pipProcess.StartInfo.ArgumentList.Add("pip");
        pipProcess.StartInfo.ArgumentList.Add("install");
        pipProcess.StartInfo.ArgumentList.Add("-r");
        pipProcess.StartInfo.ArgumentList.Add(canonicalReqFile);
        pipProcess.StartInfo.ArgumentList.Add("--disable-pip-version-check");

        pipProcess.Start();
        var pipOutTask = pipProcess.StandardOutput.ReadToEndAsync();
        var pipErrTask = pipProcess.StandardError.ReadToEndAsync();
        var waitTask = pipProcess.WaitForExitAsync();

        var allTasks = Task.WhenAll(pipOutTask, pipErrTask, waitTask);
        var completed = await Task.WhenAny(allTasks, Task.Delay(TimeSpan.FromSeconds(60)));
        if (completed != allTasks && !pipProcess.HasExited)
        {
            try { pipProcess.Kill(true); } catch { }
            Debug.WriteLine("[PythonServerManager] Timed out installing requirements. Continuing server startup.");
        }
        else if (pipProcess.ExitCode == 0)
        {
            await File.WriteAllTextAsync(hashFile, currentHash);
        }
    }

    private string? FindSystemPython()
    {
        // 1. Check py launcher
        try
        {
            var pyCheck = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "py.exe",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                }
            };
            pyCheck.StartInfo.ArgumentList.Add("-3");
            pyCheck.StartInfo.ArgumentList.Add("-c");
            pyCheck.StartInfo.ArgumentList.Add("import sys; print(sys.executable)");

            if (pyCheck.Start())
            {
                string output = pyCheck.StandardOutput.ReadToEnd().Trim();
                pyCheck.WaitForExit();
                if (pyCheck.ExitCode == 0 && File.Exists(output))
                {
                    return output;
                }
            }
        }
        catch { }

        // 2. Check python on PATH
        try
        {
            var pythonCheck = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "python.exe",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                }
            };
            pythonCheck.StartInfo.ArgumentList.Add("-c");
            pythonCheck.StartInfo.ArgumentList.Add("import sys; print(sys.executable)");

            if (pythonCheck.Start())
            {
                string output = pythonCheck.StandardOutput.ReadToEnd().Trim();
                pythonCheck.WaitForExit();
                if (pythonCheck.ExitCode == 0 && File.Exists(output))
                {
                    return output;
                }
            }
        }
        catch { }

        // 3. Check common local app data and program files installation directories
        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string programsPython = Path.Combine(localAppData, "Programs", "Python");
        if (Directory.Exists(programsPython))
        {
            foreach (var dir in Directory.GetDirectories(programsPython, "Python3*"))
            {
                string exe = Path.Combine(dir, "python.exe");
                if (File.Exists(exe)) return exe;
            }
        }

        string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        if (Directory.Exists(programFiles))
        {
            foreach (var dir in Directory.GetDirectories(programFiles, "Python3*"))
            {
                string exe = Path.Combine(dir, "python.exe");
                if (File.Exists(exe)) return exe;
            }
        }

        return null;
    }

    private static string ComputeStringHash(string input)
    {
        using var sha = SHA256.Create();
        byte[] bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes);
    }
}
