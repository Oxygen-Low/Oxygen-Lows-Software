using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace DesktopApp;

public static class VPNConnectionManager
{
    private static readonly HttpClient _client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };

    /// <summary>
    /// Creates or updates a local Windows PBK (Phonebook) VPN connection profile.
    /// Since SSTP is the safest/most secure option supported natively on Windows and Render,
    /// we build a custom PBK configuration.
    /// </summary>
    public static void CreateOrUpdateVPNProfile(string connectionName, string serverAddress)
    {
        string pbkDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Microsoft", "Network", "Connections", "Pbk");
        Directory.CreateDirectory(pbkDir);
        string pbkPath = Path.Combine(pbkDir, "rasphone.pbk");

        // Clean domain or URL to raw hostname for VPN address
        string cleanAddress = serverAddress
            .Replace("https://", "")
            .Replace("http://", "")
            .Split('/')[0];

        StringBuilder pbkContent = new StringBuilder();
        if (File.Exists(pbkPath))
        {
            pbkContent.Append(File.ReadAllText(pbkPath));
        }

        // Only append if the section doesn't already exist
        if (!pbkContent.ToString().Contains($"[{connectionName}]"))
        {
            pbkContent.AppendLine();
            pbkContent.AppendLine($"[{connectionName}]");
            pbkContent.AppendLine("MEDIA=vpn");
            pbkContent.AppendLine("Port=VPN2-0");
            pbkContent.AppendLine("Device=WAN Miniport (SSTP)");
            pbkContent.AppendLine("DEVICE=vpn");
            pbkContent.AppendLine($"PhoneNumber={cleanAddress}");
            pbkContent.AppendLine("VpnStrategy=5"); // 5 specifies SSTP specifically
            pbkContent.AppendLine("Type=2");
            pbkContent.AppendLine("AuthRestrictions=128");
            pbkContent.AppendLine("ShowDialingProgress=0");
            pbkContent.AppendLine("PreviewUserame=0");
            pbkContent.AppendLine("PreviewPassword=0");
            pbkContent.AppendLine("PreviewDomain=0");
            pbkContent.AppendLine("ShowVerifyConfig=0");
            pbkContent.AppendLine("UseRasCredentials=0");

            File.WriteAllText(pbkPath, pbkContent.ToString());
        }
    }

    /// <summary>
    /// Spawns 'rasdial' process to securely dial the VPN connection.
    /// </summary>
    public static async Task<bool> ConnectAsync(string connectionName, string username, string token)
    {
        return await Task.Run(() =>
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "rasdial.exe",
                    Arguments = $"\"{connectionName}\" \"{username}\" \"{token}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var process = Process.Start(psi);
                if (process == null) return false;

                process.WaitForExit(15000); // 15s timeout
                string output = process.StandardOutput.ReadToEnd();
                string error = process.StandardError.ReadToEnd();

                if (process.ExitCode == 0 || output.Contains("Successfully connected") || output.Contains("Command completed successfully"))
                {
                    return true;
                }

                Debug.WriteLine($"rasdial failed. Output: {output}. Error: {error}");
                return false;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"VPN Connect Exception: {ex.Message}");
                return false;
            }
        });
    }

    /// <summary>
    /// Disconnects the specified VPN connection profile.
    /// </summary>
    public static async Task<bool> DisconnectAsync(string connectionName)
    {
        return await Task.Run(() =>
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "rasdial.exe",
                    Arguments = $"\"{connectionName}\" /disconnect",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var process = Process.Start(psi);
                if (process == null) return false;

                process.WaitForExit(5000);
                return process.ExitCode == 0;
            }
            catch
            {
                return false;
            }
        });
    }
}
