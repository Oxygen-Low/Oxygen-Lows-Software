using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using DesktopApp.Models;

namespace DesktopApp;

public class GameProcessMonitor
{
    private static readonly Lazy<GameProcessMonitor> _instance = new(() => new GameProcessMonitor());
    public static GameProcessMonitor Instance => _instance.Value;

    private readonly ConcurrentDictionary<string, InstalledGame> _gamesByExeName = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, InstalledGame> _gamesById = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, RunningGameSession> _activeSessions = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<int, string> _trackedPidToGameId = new();

    private CancellationTokenSource? _cts;
    private Task? _monitorTask;
    private bool _isRunning;

    public event Action<RunningGameSession>? SessionStarted;
    public event Action<RunningGameSession, double, double>? PlaytimeTick;
    public event Action<RunningGameSession, double>? SessionEnded;

    public GameProcessMonitor()
    {
    }

    public void RegisterGame(InstalledGame game)
    {
        if (game == null || string.IsNullOrWhiteSpace(game.Id)) return;

        _gamesById[game.Id] = game;

        if (!string.IsNullOrWhiteSpace(game.ExecutableName))
        {
            var exeName = game.ExecutableName.Trim();
            _gamesByExeName[exeName] = game;
            var withoutExt = Path.GetFileNameWithoutExtension(exeName);
            if (!string.IsNullOrEmpty(withoutExt))
            {
                _gamesByExeName[withoutExt] = game;
            }
        }

        if (!string.IsNullOrWhiteSpace(game.ExecutablePath))
        {
            var fileName = Path.GetFileName(game.ExecutablePath);
            if (!string.IsNullOrEmpty(fileName))
            {
                _gamesByExeName[fileName] = game;
                var withoutExt = Path.GetFileNameWithoutExtension(fileName);
                if (!string.IsNullOrEmpty(withoutExt))
                {
                    _gamesByExeName[withoutExt] = game;
                }
            }
        }
    }

    public void RegisterGames(IEnumerable<InstalledGame> games)
    {
        if (games == null) return;
        foreach (var game in games)
        {
            RegisterGame(game);
        }
    }

    public Task StartAsync(CancellationToken cancellationToken = default)
    {
        if (_isRunning) return Task.CompletedTask;
        _isRunning = true;
        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _monitorTask = Task.Run(() => MonitorLoopAsync(_cts.Token), _cts.Token);
        return Task.CompletedTask;
    }

    public void Stop()
    {
        if (!_isRunning) return;
        _isRunning = false;
        try
        {
            _cts?.Cancel();
            _monitorTask?.Wait(1000);
        }
        catch { }
        finally
        {
            _cts?.Dispose();
            _cts = null;
        }
    }

    public List<RunningGameSession> GetRunningSessions()
    {
        var now = DateTime.UtcNow;
        var list = new List<RunningGameSession>();
        foreach (var kvp in _activeSessions)
        {
            var session = kvp.Value;
            var totalElapsed = (now - session.StartedAt).TotalSeconds;
            list.Add(new RunningGameSession
            {
                GameId = session.GameId,
                Title = session.Title,
                Platform = session.Platform,
                ProcessId = session.ProcessId,
                ProcessName = session.ProcessName,
                StartedAt = session.StartedAt,
                LastTickAt = session.LastTickAt,
                ElapsedSeconds = totalElapsed,
                TotalSessionSeconds = Math.Max(session.TotalSessionSeconds, totalElapsed)
            });
        }
        return list;
    }

    public async Task<LaunchGameResult> LaunchGameAsync(LaunchGameRequest request)
    {
        if (request == null)
        {
            return new LaunchGameResult { Success = false, Message = "Invalid launch request." };
        }

        try
        {
            // Register game metadata if not already known
            var tempGame = new InstalledGame
            {
                Id = request.GameId,
                Title = request.Title ?? request.GameId,
                Platform = request.Platform,
                LaunchUri = request.LaunchUri,
                ExecutablePath = request.ExecutablePath,
                ExecutableName = request.ExecutableName ?? (!string.IsNullOrEmpty(request.ExecutablePath) ? Path.GetFileName(request.ExecutablePath) : null)
            };
            RegisterGame(tempGame);

            Process? startedProcess = null;

            // 1. Launch via LaunchUri if provided
            if (!string.IsNullOrWhiteSpace(request.LaunchUri))
            {
                var psi = new ProcessStartInfo
                {
                    FileName = request.LaunchUri,
                    UseShellExecute = true
                };
                startedProcess = Process.Start(psi);
            }
            // 2. Launch via direct ExecutablePath
            else if (!string.IsNullOrWhiteSpace(request.ExecutablePath) && File.Exists(request.ExecutablePath))
            {
                var workingDir = !string.IsNullOrWhiteSpace(request.WorkingDirectory) && Directory.Exists(request.WorkingDirectory)
                    ? request.WorkingDirectory
                    : Path.GetDirectoryName(request.ExecutablePath);

                var psi = new ProcessStartInfo
                {
                    FileName = request.ExecutablePath,
                    Arguments = request.Arguments ?? string.Empty,
                    WorkingDirectory = workingDir,
                    UseShellExecute = true
                };
                startedProcess = Process.Start(psi);
            }
            else
            {
                return new LaunchGameResult
                {
                    Success = false,
                    Message = "No valid launch URI or executable path specified."
                };
            }

            if (startedProcess != null)
            {
                try
                {
                    int pid = startedProcess.Id;
                    _trackedPidToGameId[pid] = request.GameId;
                }
                catch { }
            }

            // Immediately trigger an initial poll
            await Task.Delay(500);
            PollProcesses();

            return new LaunchGameResult
            {
                Success = true,
                Message = "Game launched successfully.",
                ProcessId = startedProcess?.Id
            };
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to launch game {request.GameId}: {ex.Message}");
            return new LaunchGameResult
            {
                Success = false,
                Message = $"Failed to launch game: {ex.Message}"
            };
        }
    }

    private async Task MonitorLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                PollProcesses();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Error during process monitor polling: {ex.Message}");
            }

            try
            {
                await Task.Delay(2500, ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private void PollProcesses()
    {
        Process[] runningProcesses;
        try
        {
            runningProcesses = Process.GetProcesses();
        }
        catch
        {
            return;
        }

        var currentPids = new HashSet<int>();
        var matchingGameProcesses = new Dictionary<string, (Process Process, InstalledGame Game)>(StringComparer.OrdinalIgnoreCase);

        foreach (var proc in runningProcesses)
        {
            int pid = proc.Id;
            currentPids.Add(pid);

            try
            {
                string procName = proc.ProcessName;

                // 1. Check PID tracking map
                if (_trackedPidToGameId.TryGetValue(pid, out var trackedGameId))
                {
                    if (_gamesById.TryGetValue(trackedGameId, out var trackedGame))
                    {
                        matchingGameProcesses[trackedGame.Id] = (proc, trackedGame);
                        continue;
                    }
                }

                // 2. Check Exe name tracking map
                if (_gamesByExeName.TryGetValue(procName, out var matchedGame) ||
                    _gamesByExeName.TryGetValue($"{procName}.exe", out matchedGame))
                {
                    matchingGameProcesses[matchedGame.Id] = (proc, matchedGame);
                }
            }
            catch
            {
                // Access denied or process exited while inspecting
            }
        }

        var now = DateTime.UtcNow;

        // Check for new or continuing game sessions
        foreach (var kvp in matchingGameProcesses)
        {
            var gameId = kvp.Key;
            var (proc, game) = kvp.Value;

            if (_activeSessions.TryGetValue(gameId, out var existingSession))
            {
                // Update active session duration
                var delta = (now - existingSession.LastTickAt).TotalSeconds;
                var total = (now - existingSession.StartedAt).TotalSeconds;
                existingSession.ElapsedSeconds = total;

                // Heartbeat tick emitted every 15 seconds of active play
                if (delta >= 15.0)
                {
                    existingSession.TotalSessionSeconds = total;
                    existingSession.LastTickAt = now;
                    try
                    {
                        PlaytimeTick?.Invoke(existingSession, delta, total);
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"Error dispatching PlaytimeTick: {ex.Message}");
                    }
                }
            }
            else
            {
                // New game session started
                var newSession = new RunningGameSession
                {
                    GameId = game.Id,
                    Title = game.Title,
                    Platform = game.Platform,
                    ProcessId = proc.Id,
                    ProcessName = proc.ProcessName,
                    StartedAt = now,
                    LastTickAt = now,
                    ElapsedSeconds = 0,
                    TotalSessionSeconds = 0
                };

                _activeSessions[gameId] = newSession;
                _trackedPidToGameId[proc.Id] = gameId;

                try
                {
                    SessionStarted?.Invoke(newSession);
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"Error dispatching SessionStarted: {ex.Message}");
                }
            }
        }

        // Check for ended game sessions
        var endedGameIds = new List<string>();
        foreach (var kvp in _activeSessions)
        {
            var gameId = kvp.Key;
            var session = kvp.Value;

            if (!matchingGameProcesses.ContainsKey(gameId))
            {
                endedGameIds.Add(gameId);
            }
        }

        foreach (var gameId in endedGameIds)
        {
            if (_activeSessions.TryRemove(gameId, out var endedSession))
            {
                var totalSeconds = Math.Max(endedSession.TotalSessionSeconds, (now - endedSession.StartedAt).TotalSeconds);
                endedSession.TotalSessionSeconds = totalSeconds;

                _trackedPidToGameId.TryRemove(endedSession.ProcessId, out _);

                try
                {
                    SessionEnded?.Invoke(endedSession, totalSeconds);
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"Error dispatching SessionEnded: {ex.Message}");
                }
            }
        }
    }
}
