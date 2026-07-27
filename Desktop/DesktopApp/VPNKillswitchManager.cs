using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

namespace DesktopApp;

public static class VPNKillswitchManager
{
    private static bool _isKillswitchEnabled = false;
    private static readonly object _lock = new object();
    private static Task _taskQueue = Task.CompletedTask;

    /// <summary>
    /// Configures the local system-wide loopback block or firewall rules.
    /// Uses a single chained task queue so toggle operations execute in request order.
    /// </summary>
    public static Task<bool> SetKillswitchActiveAsync(bool activate)
    {
        _isKillswitchEnabled = activate;
        lock (_lock)
        {
            var tcs = new TaskCompletionSource<bool>();
            _taskQueue = _taskQueue.ContinueWith(async (prev) =>
            {
                try
                {
                    bool result = false;
                    if (activate)
                    {
                        result = await RunNetshCommandAsync("advfirewall firewall add rule name=\"VPN_KILLSWITCH_BLOCK\" dir=out action=block protocol=ANY");
                    }
                    else
                    {
                        result = await RunNetshCommandAsync("advfirewall firewall delete rule name=\"VPN_KILLSWITCH_BLOCK\"");
                    }
                    tcs.SetResult(result);
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"Killswitch Netsh Exception: {ex.Message}");
                    tcs.SetResult(false);
                }
            });
            return tcs.Task;
        }
    }

    /// <summary>
    /// Backwards compatible method signature
    /// </summary>
    public static void SetKillswitchActive(bool activate)
    {
        _ = SetKillswitchActiveAsync(activate);
    }

    /// <summary>
    /// Safe verification that cleans up any active Windows Firewall block on close or application exit.
    /// Waits for any pending operations in the queue before cleaning up.
    /// </summary>
    public static void CleanUpActiveRulesOnExit()
    {
        try
        {
            Task cleanupTask;
            lock (_lock)
            {
                _taskQueue = _taskQueue.ContinueWith(async (prev) =>
                {
                    await RunNetshCommandAsync("advfirewall firewall delete rule name=\"VPN_KILLSWITCH_BLOCK\"");
                });
                cleanupTask = _taskQueue;
            }
            cleanupTask.Wait(5000); // 5s timeout on close
        }
        catch
        {
            // Fail silent on cleanup
        }
    }

    private static async Task<bool> RunNetshCommandAsync(string arguments)
    {
        return await Task.Run(() =>
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "netsh.exe",
                    Arguments = arguments,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var proc = Process.Start(psi);
                if (proc == null) return false;

                bool cleanExit = proc.WaitForExit(5000);
                if (!cleanExit)
                {
                    try { proc.Kill(); } catch { }
                    Debug.WriteLine("netsh process timed out.");
                    return false;
                }

                string err = proc.StandardError.ReadToEnd();
                if (proc.ExitCode != 0)
                {
                    Debug.WriteLine($"netsh command failed with code {proc.ExitCode}: {err}");
                    return false;
                }

                return true;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"netsh execution exception: {ex.Message}");
                return false;
            }
        });
    }
}
