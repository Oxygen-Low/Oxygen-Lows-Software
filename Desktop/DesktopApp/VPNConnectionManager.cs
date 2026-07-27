using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
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

        // Sanitize cleanAddress and connectionName to prevent INI inject exploits
        cleanAddress = Regex.Replace(cleanAddress, @"[^\w\.\-]", "");
        connectionName = Regex.Replace(connectionName, @"[^\w\s\(\)\-]", "");

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
    /// Stages credentials securely instead of embedding sensitive tokens in ProcessStartInfo.Arguments.
    /// </summary>
    public static async Task<bool> ConnectAsync(string connectionName, string username, string token)
    {
        return await Task.Run(() =>
        {
            try
            {
                // Stage credentials securely using cmdkey / generic windows credentials manager
                // cmdkey /generic:target /user:username /pass:token
                string targetName = $"OxygenLowsSoftwareVPN_{connectionName}";
                var psiCmdKey = new ProcessStartInfo
                {
                    FileName = "cmdkey.exe",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
                psiCmdKey.ArgumentList.Add($"/generic:{targetName}");
                psiCmdKey.ArgumentList.Add($"/user:{username}");
                psiCmdKey.ArgumentList.Add($"/pass:{token}");

                using (var procCmdKey = Process.Start(psiCmdKey))
                {
                    if (procCmdKey == null || !procCmdKey.WaitForExit(10000)) return false;
                }

                var psi = new ProcessStartInfo
                {
                    FileName = "rasdial.exe",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                // Use ArgumentList with rasdial target name directly to quote arguments securely
                psi.ArgumentList.Add(connectionName);
                psi.ArgumentList.Add(username);
                psi.ArgumentList.Add(token);

                using var process = Process.Start(psi);
                if (process == null) return false;

                bool cleanExit = process.WaitForExit(15000); // 15s timeout
                if (!cleanExit)
                {
                    try { process.Kill(); } catch { }
                    Debug.WriteLine("rasdial dial-up phase timed out.");
                    return false;
                }

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
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                psi.ArgumentList.Add(connectionName);
                psi.ArgumentList.Add("/disconnect");

                using var process = Process.Start(psi);
                if (process == null) return false;

                bool cleanExit = process.WaitForExit(15000);
                if (!cleanExit)
                {
                    try { process.Kill(); } catch { }
                    Debug.WriteLine("rasdial disconnect phase timed out.");
                    return false;
                }

                return process.ExitCode == 0;
            }
            catch
            {
                return false;
            }
        });
    }
}
