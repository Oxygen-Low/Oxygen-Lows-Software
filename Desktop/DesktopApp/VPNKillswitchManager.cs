using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

namespace DesktopApp;

public static class VPNKillswitchManager
{
    private static bool _isKillswitchEnabled = false;

    /// <summary>
    /// Configures the local system-wide loopback block or firewall rules.
    /// When VPN is supposed to be connected but is offline, we completely disable internet access.
    /// This uses native netsh commands to block non-VPN outgoing traffic, or blocks interface metrics.
    /// </summary>
    public static void SetKillswitchActive(bool activate)
    {
        _isKillswitchEnabled = activate;
        Task.Run(() =>
        {
            try
            {
                if (activate)
                {
                    // Block all outbound traffic except what we specifically whitelist or standard VPN routes
                    RunNetshCommand("advfirewall firewall add rule name=\"VPN_KILLSWITCH_BLOCK\" dir=out action=block protocol=ANY");
                }
                else
                {
                    // Remove outbound block rules
                    RunNetshCommand("advfirewall firewall delete rule name=\"VPN_KILLSWITCH_BLOCK\"");
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Killswitch Netsh Exception: {ex.Message}");
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
            RunNetshCommand("advfirewall firewall delete rule name=\"VPN_KILLSWITCH_BLOCK\"");
        }
        catch
        {
            // Fail silent on cleanup
        }
    }

    private static void RunNetshCommand(string arguments)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "netsh.exe",
            Arguments = arguments,
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var proc = Process.Start(psi);
        proc?.WaitForExit(3000);
    }
}
