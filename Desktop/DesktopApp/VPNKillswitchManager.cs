using System;
using System.Diagnostics;
using System.Threading.Tasks;

namespace DesktopApp;

public static class VPNKillswitchManager
{
    private static bool _isKillswitchEnabled = false;
    private static readonly object _lock = new object();
    private static Task _taskQueue = Task.CompletedTask;

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
                    bool result = true;
                    if (activate)
                    {
                        result &= await RunNetshCommandAsync("advfirewall firewall add rule name=\"VPN_KILLSWITCH_BLOCK\" dir=out action=block protocol=ANY");
                        result &= await RunNetshCommandAsync("advfirewall firewall add rule name=\"VPN_KILLSWITCH_ALLOW_PROXY\" dir=out action=allow remoteip=127.0.0.1 protocol=TCP remoteport=9090");
                        result &= await RunNetshCommandAsync("advfirewall firewall add rule name=\"VPN_KILLSWITCH_ALLOW_VPN\" dir=out action=allow program=ANY protocol=TCP remoteport=443");
                    }
                    else
                    {
                        await RunNetshCommandAsync("advfirewall firewall delete rule name=\"VPN_KILLSWITCH_BLOCK\"");
                        await RunNetshCommandAsync("advfirewall firewall delete rule name=\"VPN_KILLSWITCH_ALLOW_PROXY\"");
                        await RunNetshCommandAsync("advfirewall firewall delete rule name=\"VPN_KILLSWITCH_ALLOW_VPN\"");
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

    public static void SetKillswitchActive(bool activate)
    {
        _ = SetKillswitchActiveAsync(activate);
    }

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
                    await RunNetshCommandAsync("advfirewall firewall delete rule name=\"VPN_KILLSWITCH_ALLOW_PROXY\"");
                    await RunNetshCommandAsync("advfirewall firewall delete rule name=\"VPN_KILLSWITCH_ALLOW_VPN\"");
                });
                cleanupTask = _taskQueue;
            }
            cleanupTask.Wait(5000);
        }
        catch { }
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
                    return false;
                }
                return proc.ExitCode == 0;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"netsh execution exception: {ex.Message}");
                return false;
            }
        });
    }
}
