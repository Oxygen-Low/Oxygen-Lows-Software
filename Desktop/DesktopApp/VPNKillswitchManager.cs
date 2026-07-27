using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace DesktopApp;

public static class VPNKillswitchManager
{
    private static bool _isKillswitchEnabled = false;
    private static readonly SemaphoreSlim _semaphore = new SemaphoreSlim(1, 1);

    /// <summary>
    /// Configures the local system-wide loopback block or firewall rules.
    /// When VPN is supposed to be connected but is offline, we completely disable internet access.
    /// This uses native netsh commands to block non-VPN outgoing traffic, or blocks interface metrics.
    /// Uses a SemaphoreSlim to serialize execution and prevent out of order toggles.
    /// </summary>
    public static void SetKillswitchActive(bool activate)
    {
        _isKillswitchEnabled = activate;
        Task.Run(async () =>
        {
            await _semaphore.WaitAsync();
            try
            {
                if (activate)
                {
                    // Block all outbound traffic except what we specifically whitelist or standard VPN routes
                    await RunNetshCommandAsync("advfirewall firewall add rule name=\"VPN_KILLSWITCH_BLOCK\" dir=out action=block protocol=ANY");
                }
                else
                {
                    // Remove outbound block rules
                    await RunNetshCommandAsync("advfirewall firewall delete rule name=\"VPN_KILLSWITCH_BLOCK\"");
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Killswitch Netsh Exception: {ex.Message}");
            }
            finally
            {
                _semaphore.Release();
            }
        });
    }

    /// <summary>
    /// Safe verification that cleans up any active Windows Firewall block on close or application exit,
    /// preventing a permanent lockout for the user's host machine.
    /// </summary>
    public static void CleanUpActiveRulesOnExit()
    {
        try
        {
            _semaphore.Wait();
            RunNetshCommandAsync("advfirewall firewall delete rule name=\"VPN_KILLSWITCH_BLOCK\"").Wait();
        }
        catch
        {
            // Fail silent on cleanup
        }
        finally
        {
            try { _semaphore.Release(); } catch { }
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
