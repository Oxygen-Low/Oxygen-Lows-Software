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

    private Process? _serverProcess;
    private readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(2) };
    private readonly SemaphoreSlim _startLock = new(1, 1);
    private TaskCompletionSource<bool>? _readyTcs;

    public bool IsRunning { get; private set; }
    public int Port { get; private set; } = 54123;
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

    public async Task<bool> StartAsync()
    {
        await _startLock.WaitAsync();
        try
        {
            if (IsRunning && _serverProcess != null && !_serverProcess.HasExited)
            {
                return true;
            }

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

            var startInfo = new ProcessStartInfo
            {
                FileName = pythonExecutable,
                Arguments = $"\"{serverScriptPath}\" --parent-pid {Environment.ProcessId} --port {Port} --watch-stdin",
                WorkingDirectory = Path.GetDirectoryName(serverScriptPath)!,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                RedirectStandardInput = true
            };

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
            var timeoutTask = Task.Delay(10000);

            var completedTask = await Task.WhenAny(readyTask, timeoutTask);
            if (completedTask == readyTask && await readyTask)
            {
                // Verify with health check
                bool healthy = await PollHealthCheckAsync(TimeSpan.FromSeconds(3));
                if (healthy)
                {
                    IsRunning = true;
                    SetStatus("Running");
                    OnServerReady?.Invoke(ServerUrl);
                    return true;
                }
            }

            SetStatus("Failed", "Timed out waiting for Python server handshake.");
            return false;
        }
        catch (Exception ex)
        {
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
                    _ = _httpClient.PostAsync($"{ServerUrl}/shutdown", new StringContent("{}", Encoding.UTF8, "application/json"));
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
            IsRunning = false;
            SetStatus("Stopped");
        }
    }

    private async Task<bool> PollHealthCheckAsync(TimeSpan timeout)
    {
        var cts = new CancellationTokenSource(timeout);
        while (!cts.Token.IsCancellationRequested)
        {
            try
            {
                var response = await _httpClient.GetAsync($"{ServerUrl}/health", cts.Token);
                if (response.IsSuccessStatusCode)
                {
                    return true;
                }
            }
            catch
            {
                await Task.Delay(200);
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

        Directory.CreateDirectory(Path.GetDirectoryName(VenvPath)!);

        var venvProcess = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = systemPython,
                Arguments = $"-m venv \"{VenvPath}\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            }
        };

        venvProcess.Start();
        await venvProcess.WaitForExitAsync();

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
        string pipExecutable = Path.Combine(VenvPath, "Scripts", "pip.exe");
        if (!File.Exists(pipExecutable))
        {
            pipExecutable = pythonExecutable;
        }

        var pipArgs = pipExecutable == pythonExecutable
            ? $"-m pip install -r \"{reqFile}\" --disable-pip-version-check"
            : $"install -r \"{reqFile}\" --disable-pip-version-check";

        var pipProcess = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = pipExecutable,
                Arguments = pipArgs,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            }
        };

        pipProcess.Start();
        await pipProcess.WaitForExitAsync();

        if (pipProcess.ExitCode == 0)
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
                    Arguments = "-3 -c \"import sys; print(sys.executable)\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                }
            };
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
                    Arguments = "-c \"import sys; print(sys.executable)\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                }
            };
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
