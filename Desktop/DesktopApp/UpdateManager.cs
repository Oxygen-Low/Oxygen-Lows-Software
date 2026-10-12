using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading;
using System.Text.Json;
using System.Threading.Tasks;

namespace DesktopApp
{
    public class UpdateManager
    {
        private const string GitHubApiUrl = "https://api.github.com/repos/Oxygen-Low/Oxygen-Lows-Software/releases/latest";
        private static readonly string CurrentVersion = GetCurrentVersion();

        private string? _verifiedUrl;
        private string? _verifiedDigest;
        private long _verifiedSize;
        public string Version => CurrentVersion;

        public static bool IsReleaseUrl(string value) =>
            Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == "https" &&
            uri.Port == 443 && string.IsNullOrEmpty(uri.UserInfo) && uri.Host == "github.com" &&
            uri.AbsolutePath.StartsWith("/Oxygen-Low/Oxygen-Lows-Software/releases/download/", StringComparison.Ordinal);

        public static bool IsDownloadUrl(string value) => IsReleaseUrl(value) ||
            (Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == "https" &&
             uri.Port == 443 && string.IsNullOrEmpty(uri.UserInfo) &&
             (uri.Host == "release-assets.githubusercontent.com" || uri.Host == "objects.githubusercontent.com"));

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
            return "1.1.0";
        }

        public async Task<(bool HasUpdate, string? DownloadUrl, string? Version)> CheckForUpdatesAsync()
        {
            _verifiedUrl = null;
            _verifiedDigest = null;
            _verifiedSize = 0;
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
                        nameElement.GetString() == "OxygenLowsSoftware_Installer.exe")
                    {
                        if (asset.TryGetProperty("browser_download_url", out var urlElement))
                        {
                            var url = urlElement.GetString();
                            var digest = asset.TryGetProperty("digest", out var d) ? d.GetString() : null;
                            var size = asset.TryGetProperty("size", out var z) ? z.GetInt64() : 0;
                            if (url == null || !IsReleaseUrl(url) || digest == null ||
                                !System.Text.RegularExpressions.Regex.IsMatch(digest, "^sha256:[0-9a-fA-F]{64}$") ||
                                size <= 0 || size > 512L * 1024 * 1024) continue;
                            _verifiedUrl = url;
                            _verifiedDigest = digest.Substring(7);
                            _verifiedSize = size;
                            return (true, url, latestVersion);
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
            return System.Version.TryParse(latestVersion, out var latest) &&
                   System.Version.TryParse(currentVersion, out var current) &&
                   latest > current;
        }

        public async Task DownloadAndRunInstallerAsync(string downloadUrl, Action<int>? progressCallback = null)
        {
            var release = await CheckForUpdatesAsync();
            if (!release.HasUpdate || downloadUrl != _verifiedUrl || _verifiedDigest == null)
                throw new InvalidOperationException("Update is not a verified release asset");
            var expectedDigest = _verifiedDigest;
            var expectedSize = _verifiedSize;
            var tempDirectory = Directory.CreateTempSubdirectory("OxygenUpdate-");
            var tempFile = Path.Combine(tempDirectory.FullName, "installer.exe");
            try
            {
                using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false });
                using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(5));
                string currentUrl = downloadUrl;
                HttpResponseMessage? response = null;
                try
                {
                    for (int redirects = 0; redirects <= 5; redirects++)
                    {
                        if (!IsDownloadUrl(currentUrl)) throw new InvalidOperationException("Invalid update destination");
                        response = await client.GetAsync(currentUrl, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
                        if ((int)response.StatusCode >= 300 && (int)response.StatusCode < 400)
                        {
                            var location = response.Headers.Location;
                            response.Dispose();
                            response = null;
                            if (location == null || redirects == 5) throw new InvalidOperationException("Invalid update redirect");
                            currentUrl = new Uri(new Uri(currentUrl), location).AbsoluteUri;
                            continue;
                        }
                        break;
                    }
                    if (response == null) throw new InvalidOperationException("No update response");
                    response.EnsureSuccessStatusCode();
                    using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
                    using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
                    using (var output = new FileStream(tempFile, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                    {
                        var buffer = new byte[8192];
                        long totalRead = 0;
                        int read;
                        while ((read = await stream.ReadAsync(buffer, timeout.Token)) != 0)
                        {
                            totalRead += read;
                            if (totalRead > expectedSize) throw new InvalidOperationException("Update size mismatch");
                            hash.AppendData(buffer, 0, read);
                            await output.WriteAsync(buffer.AsMemory(0, read), timeout.Token);
                            progressCallback?.Invoke((int)(totalRead * 100 / expectedSize));
                        }
                        if (totalRead != expectedSize || !CryptographicOperations.FixedTimeEquals(hash.GetHashAndReset(), Convert.FromHexString(expectedDigest)))
                            throw new InvalidOperationException("Update integrity check failed");
                    }
                }
                finally { response?.Dispose(); }
                Process.Start(new ProcessStartInfo { FileName = tempFile, Arguments = "--update", UseShellExecute = true });
                Environment.Exit(0);
            }
            catch
            {
                tempDirectory.Delete(recursive: true);
                throw;
            }
        }
    }
}
