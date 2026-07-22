using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Text.Json;
using System.Threading.Tasks;

namespace DesktopApp
{
    public class UpdateManager
    {
        private const string GitHubApiUrl = "https://api.github.com/repos/Oxygen-Low/Oxygen-Lows-Software/releases/latest";
        private static readonly string CurrentVersion = GetCurrentVersion();

        public string Version => CurrentVersion;

        private static string GetCurrentVersion()
        {
            try
            {
                var version = Assembly.GetExecutingAssembly().GetName().Version;
                if (version != null)
                {
                    return $"{version.Major}.{version.Minor}.{version.Build}";
                }
            }
            catch
            {
            }
            return "1.0.0";
        }

        public async Task<(bool HasUpdate, string? DownloadUrl, string? Version)> CheckForUpdatesAsync()
        {
            try
            {
                using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
                client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("DesktopApp", CurrentVersion));
                
                var response = await client.GetStringAsync(GitHubApiUrl);
                using var document = JsonDocument.Parse(response);
                
                var root = document.RootElement;
                if (!root.TryGetProperty("tag_name", out var tagElement)) return (false, null, null);
                
                var latestVersion = tagElement.GetString()?.TrimStart('v');
                if (latestVersion == null || !IsNewerVersion(latestVersion, CurrentVersion)) return (false, null, null);

                if (!root.TryGetProperty("assets", out var assetsElement)) return (false, null, null);
                
                foreach (var asset in assetsElement.EnumerateArray())
                {
                    if (asset.TryGetProperty("name", out var nameElement) && 
                        nameElement.GetString()?.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) == true)
                    {
                        if (asset.TryGetProperty("browser_download_url", out var urlElement))
                        {
                            return (true, urlElement.GetString(), latestVersion);
                        }
                    }
                }
                
                return (false, null, null);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Error checking for updates: {ex.Message}");
                return (false, null, null);
            }
        }

        private static bool IsNewerVersion(string latestVersion, string currentVersion)
        {
            return Version.TryParse(latestVersion, out var latest) &&
                   Version.TryParse(currentVersion, out var current) &&
                   latest > current;
        }

        public async Task DownloadAndRunInstallerAsync(string downloadUrl, Action<int>? progressCallback = null)
        {
            var tempFile = Path.Combine(Path.GetTempPath(), "DesktopInstaller.exe");
            
            using var client = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
            using var response = await client.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead);
            response.EnsureSuccessStatusCode();
            
            var totalBytes = response.Content.Headers.ContentLength ?? -1L;
            var canReportProgress = totalBytes != -1 && progressCallback != null;

            using var stream = await response.Content.ReadAsStreamAsync();
            using var fileStream = new FileStream(tempFile, FileMode.Create, FileAccess.Write, FileShare.None);
            
            var buffer = new byte[8192];
            var totalRead = 0L;
            var isMoreToRead = true;

            do
            {
                var read = await stream.ReadAsync(buffer, 0, buffer.Length);
                if (read == 0)
                {
                    isMoreToRead = false;
                }
                else
                {
                    await fileStream.WriteAsync(buffer, 0, read);
                    totalRead += read;

                    if (canReportProgress)
                    {
                        var progress = (int)((totalRead * 100) / totalBytes);
                        progressCallback!(progress);
                    }
                }
            } while (isMoreToRead);
            
            fileStream.Close();
            
            Process.Start(new ProcessStartInfo
            {
                FileName = tempFile,
                Arguments = "--update",
                UseShellExecute = true
            });
            
            Environment.Exit(0);
        }
    }
}
