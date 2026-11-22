using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace DesktopApp
{
    /// <summary>
    /// Manages the local llama.cpp installation and the llama-server processes.
    ///
    /// Security notes:
    /// - All release URLs are verified against the ggml-org/llama.cpp GitHub
    ///   release API; only URLs returned by that API (and redirecting through
    ///   GitHub-controlled asset hosts) are ever downloaded.
    /// - Downloads are size-capped and SHA256-verified when the release asset
    ///   advertises a digest.
    /// - Model files may only live inside a dedicated models directory. Paths
    ///   coming from the webview are resolved and confined to that directory.
    /// </summary>
    public sealed class LlamaManager
    {
        private const string ReleasesApiUrl =
            "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest";
        private const string ReleasesTagUrl =
            "https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/";
        private const string ReleasePageUrl =
            "https://github.com/ggml-org/llama.cpp/releases";
        // The app's own release ships a llama.cpp build from PR #32517, which
        // adds Hy4 Flash GGUF support that upstream has not merged yet. We
        // prefer this asset; upstream releases remain a fallback.
        private const string AppReleasesApiUrl =
            "https://api.github.com/repos/Oxygen-Low/Oxygen-Lows-Software/releases/latest";
        private const string AppReleasePageUrl =
            "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases";
        private const string PreferredWindowsAsset = "llama-win-x64.zip";
        private const string PreferredAndroidAssetPrefix = "llama-android-";
        private const long MaxAssetBytes = 2L * 1024 * 1024 * 1024; // 2 GiB

        private static readonly string RootDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "OxygenLowsSoftware", "llama.cpp");
        private static readonly string BinaryDirectory = Path.Combine(RootDirectory, "bin");
        private static readonly string ModelsDirectory = Path.Combine(RootDirectory, "models");
        private static readonly string ConfigPath = Path.Combine(RootDirectory, "config.json");
        private static readonly string StatePath = Path.Combine(RootDirectory, "state.json");

        private readonly object _sync = new object();
        private readonly HttpClient _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        private readonly ConcurrentDictionary<int, Process> _processes = new ConcurrentDictionary<int, Process>();
        private int _nextInstanceId = 1;

        private Config _config;
        private State _state;

        private sealed class Config
        {
            public string InstalledVersion { get; set; } = "";
            public string IgnoredVersion { get; set; } = "";
            public bool AutoCheckUpdates { get; set; } = true;
        }

        private sealed class State
        {
            public Dictionary<string, ModelSettings> Models { get; set; } = new Dictionary<string, ModelSettings>(StringComparer.OrdinalIgnoreCase);
        }

        public sealed class ModelSettings
        {
            public string Id { get; set; } = "";
            public string FileName { get; set; } = "";
            public string DisplayName { get; set; } = "";
            public string Source { get; set; } = "manual"; // manual | huggingface | modelscope
            public string SourceId { get; set; } = "";
            public List<string> Shards { get; set; } = new List<string>();
            /// <summary>
            /// Absolute paths of imported shard files. When set, the files are used
            /// in place and never copied into (or deleted from) the models folder.
            /// </summary>
            public List<string> Paths { get; set; } = new List<string>();
            public string Mmproj { get; set; } = "";
            /// <summary>Absolute path of an imported mmproj file, if any.</summary>
            public string MmprojPath { get; set; } = "";
            public bool UseJinja { get; set; } = false;
            public bool Mmap { get; set; } = true;
            public int ContextSize { get; set; } = 4096;
            public int GpuLayers { get; set; } = -1;
            public int Port { get; set; } = 0;
        }

        private sealed class ModelGroup
        {
            public string Id { get; set; } = "";
            public List<string> Shards { get; set; } = new List<string>();
            public List<string> ShardPaths { get; set; } = new List<string>();
            public int ExpectedShards { get; set; } = 1;
            public string Mmproj { get; set; } = "";
            public string MmprojPath { get; set; } = "";
            public long SizeBytes { get; set; }
            /// <summary>True when the model's files live outside the models folder.</summary>
            public bool Referenced { get; set; }
        }

        public sealed class ReleaseInfo
        {
            public string Version { get; set; } = "";
            public string Tag { get; set; } = "";
            public List<AssetInfo> Assets { get; set; } = new List<AssetInfo>();
            public string PageUrl { get; set; } = ReleasePageUrl;
        }

        public sealed class AssetInfo
        {
            public string Name { get; set; } = "";
            public string Url { get; set; } = "";
            public string Digest { get; set; } = "";
            public long Size { get; set; }
            public string Platform { get; set; } = ""; // win | linux | mac
            public string Arch { get; set; } = ""; // x64 | arm64
            public bool IsCuda { get; set; }
        }

        public LlamaManager()
        {
            Directory.CreateDirectory(RootDirectory);
            Directory.CreateDirectory(BinaryDirectory);
            Directory.CreateDirectory(ModelsDirectory);
            _config = LoadJson<Config>(ConfigPath) ?? new Config();
            _state = LoadJson<State>(StatePath) ?? new State();
            _httpClient.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("OxygenLowsSoftware", "1.0"));
            _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        }

        private static T? LoadJson<T>(string path) where T : class
        {
            try
            {
                if (!File.Exists(path)) return null;
                return JsonSerializer.Deserialize<T>(File.ReadAllText(path));
            }
            catch { return null; }
        }

        private static void SaveJson<T>(string path, T value)
        {
            try
            {
                string temp = path + ".tmp";
                File.WriteAllText(temp, JsonSerializer.Serialize(value));
                File.Move(temp, path, true);
            }
            catch (Exception ex) { Debug.WriteLine("llama config save: " + ex.Message); }
        }

        private void SaveConfig() => SaveJson(ConfigPath, _config);
        private void SaveState() => SaveJson(StatePath, _state);

        public string InstalledVersion => _config.InstalledVersion;
        public string IgnoredVersion => _config.IgnoredVersion;
        public bool AutoCheckUpdates => _config.AutoCheckUpdates;
        public string ModelsPath => ModelsDirectory;
        public string BinaryPath => BinaryDirectory;

        // ─── Version / release lookup ────────────────────────────────────────

        public async Task<ReleaseInfo> GetLatestReleaseAsync(bool useCache = true)
        {
            var latest = await FetchReleaseAsync(ReleasesApiUrl).ConfigureAwait(false);
            if (latest.Assets.Count > 0) return latest;

            // llama.cpp publishes binaries on nightly releases; the stable
            // "latest" release only carries a nightly-tag.txt pointer.
            string? nightlyTag = await ReadNightlyTagAsync().ConfigureAwait(false);
            if (!string.IsNullOrWhiteSpace(nightlyTag))
            {
                var nightly = await GetReleaseByTagAsync(nightlyTag).ConfigureAwait(false);
                if (nightly.Assets.Count > 0) return nightly;
            }
            return latest;
        }

        private async Task<string?> ReadNightlyTagAsync()
        {
            try
            {
                using var response = await _httpClient.GetAsync(ReleasesApiUrl).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode) return null;
                using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync().ConfigureAwait(false));
                if (!doc.RootElement.TryGetProperty("assets", out var assets) || assets.ValueKind != JsonValueKind.Array)
                    return null;
                foreach (var asset in assets.EnumerateArray())
                {
                    string name = asset.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                    if (!string.Equals(name, "nightly-tag.txt", StringComparison.OrdinalIgnoreCase)) continue;
                    string apiUrl = asset.TryGetProperty("url", out var u) ? u.GetString() ?? "" : "";
                    // Fixed GitHub API host and path - no untrusted URLs.
                    if (!apiUrl.StartsWith("https://api.github.com/repos/ggml-org/llama.cpp/releases/assets/", StringComparison.OrdinalIgnoreCase))
                        continue;
                    using var request = new HttpRequestMessage(HttpMethod.Get, apiUrl);
                    request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/octet-stream"));
                    using var tagResponse = await _httpClient.SendAsync(request).ConfigureAwait(false);
                    if (!tagResponse.IsSuccessStatusCode) return null;
                    string tag = (await tagResponse.Content.ReadAsStringAsync().ConfigureAwait(false)).Trim();
                    return tag.Length > 0 && tag.Length <= 40 && tag.All(c => char.IsLetterOrDigit(c) || c == '-' || c == '_' || c == '.')
                        ? tag
                        : null;
                }
            }
            catch (Exception ex) { Debug.WriteLine("Nightly tag lookup: " + ex.Message); }
            return null;
        }

        public async Task<ReleaseInfo> GetReleaseByTagAsync(string tag)
        {
            if (string.IsNullOrWhiteSpace(tag) || !tag.All(c => char.IsLetterOrDigit(c) || c == '-' || c == '_' || c == '.'))
                throw new InvalidOperationException("Invalid release tag");
            return await FetchReleaseAsync(ReleasesTagUrl + Uri.EscapeDataString(tag)).ConfigureAwait(false);
        }

        private async Task<ReleaseInfo> FetchReleaseAsync(string url)
        {
            using var response = await _httpClient.GetAsync(url).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync().ConfigureAwait(false));
            var root = doc.RootElement;
            string tag = root.TryGetProperty("tag_name", out var t) ? t.GetString() ?? "" : "";
            string version = tag.TrimStart('b', 'v');
            var info = new ReleaseInfo { Version = version, Tag = tag };
            if (root.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
            {
                foreach (var asset in assets.EnumerateArray())
                {
                    string name = asset.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                    string downloadUrl = asset.TryGetProperty("browser_download_url", out var u) ? u.GetString() ?? "" : "";
                    long size = asset.TryGetProperty("size", out var s) && s.TryGetInt64(out var sv) ? sv : 0;
                    string digest = asset.TryGetProperty("digest", out var d) ? d.GetString() ?? "" : "";
                    if (!IsReleaseAssetUrl(downloadUrl)) continue;
                    if (digest.Length > 0 && !System.Text.RegularExpressions.Regex.IsMatch(digest, "^sha256:[0-9a-fA-F]{64}$")) continue;
                    if (size > MaxAssetBytes) continue;
                    var parsed = ParseAsset(name);
                    if (parsed.Platform == "") continue;
                    info.Assets.Add(new AssetInfo
                    {
                        Name = name,
                        Url = downloadUrl,
                        Digest = digest,
                        Size = size,
                        Platform = parsed.Platform,
                        Arch = parsed.Arch,
                        IsCuda = parsed.IsCuda
                    });
                }
            }
            return info;
        }

        /// <summary>
        /// Fetches the llama.cpp build shipped on our own release (built from
        /// PR #32517, which adds Hy4 Flash GGUF support). Returns null if the
        /// release has no such asset yet, in which case callers fall back to
        /// the upstream ggml-org release.
        /// </summary>
        private async Task<ReleaseInfo?> FetchPreferredHy4ReleaseAsync()
        {
            try
            {
                using var response = await _httpClient.GetAsync(AppReleasesApiUrl).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode) return null;
                using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync().ConfigureAwait(false));
                var root = doc.RootElement;
                string tag = root.TryGetProperty("tag_name", out var t) ? t.GetString() ?? "" : "";
                if (root.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
                {
                    foreach (var asset in assets.EnumerateArray())
                    {
                        string name = asset.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                        if (!string.Equals(name, PreferredWindowsAsset, StringComparison.OrdinalIgnoreCase)) continue;
                        string url = asset.TryGetProperty("browser_download_url", out var u) ? u.GetString() ?? "" : "";
                        long size = asset.TryGetProperty("size", out var s) && s.TryGetInt64(out var sv) ? sv : 0;
                        string digest = asset.TryGetProperty("digest", out var d) ? d.GetString() ?? "" : "";
                        if (!IsReleaseAssetUrl(url) || size <= 0 || size > MaxAssetBytes) continue;
                        if (digest.Length > 0 && !System.Text.RegularExpressions.Regex.IsMatch(digest, "^sha256:[0-9a-fA-F]{64}$")) continue;
                        var info = new ReleaseInfo
                        {
                            Version = "hy4-" + tag.TrimStart('v'),
                            Tag = tag,
                            PageUrl = AppReleasePageUrl
                        };
                        info.Assets.Add(new AssetInfo
                        {
                            Name = name, Url = url, Digest = digest, Size = size,
                            Platform = "win", Arch = "x64", IsCuda = false
                        });
                        return info;
                    }
                }
            }
            catch (Exception ex) { Debug.WriteLine("Hy4 release lookup: " + ex.Message); }
            return null;
        }

        public static bool IsReleaseAssetUrl(string? value)
        {
            if (string.IsNullOrWhiteSpace(value) || !Uri.TryCreate(value, UriKind.Absolute, out var uri)) return false;
            if (uri.Scheme != Uri.UriSchemeHttps || uri.Port != 443 || !string.IsNullOrEmpty(uri.UserInfo)) return false;
            return uri.Host == "github.com"
                ? uri.AbsolutePath.StartsWith("/ggml-org/llama.cpp/releases/download/", StringComparison.OrdinalIgnoreCase) ||
                  uri.AbsolutePath.StartsWith("/Oxygen-Low/Oxygen-Lows-Software/releases/download/", StringComparison.OrdinalIgnoreCase)
                : uri.Host == "objects.githubusercontent.com" || uri.Host == "release-assets.githubusercontent.com";
        }

        private static (string Platform, string Arch, bool IsCuda) ParseAsset(string name)
        {
            string lower = name.ToLowerInvariant();
            string platform = lower.Contains("win") || lower.Contains("windows") ? "win"
                : lower.Contains("mac") || lower.Contains("darwin") || lower.Contains("osx") ? "mac"
                : lower.Contains("linux") ? "linux" : "";
            string arch = lower.Contains("arm64") || lower.Contains("aarch64") ? "arm64"
                : lower.Contains("x64") || lower.Contains("x86_64") || lower.Contains("amd64") ? "x64" : "";
            bool cuda = lower.Contains("cuda") && !lower.Contains("nocuda") && !lower.Contains("cpu");
            if (platform == "" || arch == "") return ("", "", cuda);
            // Only binary archives; skip source tarballs and checksum files.
            if (!(lower.EndsWith(".zip") || lower.EndsWith(".tar.gz") || lower.EndsWith(".tgz"))) return ("", "", cuda);
            if (!lower.Contains("bin") && !lower.Contains("llama") && !lower.Contains("server")) return ("", "", cuda);
            return (platform, arch, cuda);
        }

        public static bool IsNewerVersion(string latest, string current)
        {
            if (string.IsNullOrWhiteSpace(latest)) return false;
            if (string.IsNullOrWhiteSpace(current)) return true;
            return CompareVersions(latest, current) > 0;
        }

        private static string StripPrefix(string value)
        {
            string v = value.Trim();
            if (v.StartsWith("hy4-", StringComparison.OrdinalIgnoreCase)) v = v.Substring(4);
            return v.TrimStart('v', 'b');
        }

        private static int CompareVersions(string a, string b)
        {
            var pa = StripPrefix(a).Split(new[] { '.', '-' }, StringSplitOptions.RemoveEmptyEntries);
            var pb = StripPrefix(b).Split(new[] { '.', '-' }, StringSplitOptions.RemoveEmptyEntries);
            int n = Math.Max(pa.Length, pb.Length);
            for (int i = 0; i < n; i++)
            {
                int va = i < pa.Length && int.TryParse(pa[i], out var aNum) ? aNum : 0;
                int vb = i < pb.Length && int.TryParse(pb[i], out var bNum) ? bNum : 0;
                if (va != vb) return va.CompareTo(vb);
            }
            return 0;
        }

        /// <summary>
        /// Returns the newest available version string. Prefers the Hy4-enabled
        /// build on our own release; falls back to upstream llama.cpp.
        /// </summary>
        public async Task<ReleaseInfo> GetPreferredReleaseAsync()
        {
            var hy4 = await FetchPreferredHy4ReleaseAsync().ConfigureAwait(false);
            if (hy4 != null) return hy4;
            return await GetLatestReleaseAsync().ConfigureAwait(false);
        }

        public void SetIgnoredVersion(string version)
        {
            _config.IgnoredVersion = version ?? "";
            SaveConfig();
        }

        public void SetAutoCheckUpdates(bool enabled)
        {
            _config.AutoCheckUpdates = enabled;
            SaveConfig();
        }

        // ─── Install / uninstall ─────────────────────────────────────────────

        public bool IsInstalled()
        {
            return !string.IsNullOrEmpty(_config.InstalledVersion) && FindServerExecutable() != null;
        }

        public string? FindServerExecutable()
        {
            if (!Directory.Exists(BinaryDirectory)) return null;
            var exe = Directory.GetFiles(BinaryDirectory, "llama-server.exe", SearchOption.AllDirectories).FirstOrDefault();
            if (exe != null) return exe;
            var bin = Directory.GetFiles(BinaryDirectory, "llama-server", SearchOption.AllDirectories).FirstOrDefault();
            if (bin != null) return bin;
            return null;
        }

        public async Task InstallAsync(string tag, Action<int>? progress = null, CancellationToken ct = default)
        {
            var release = string.IsNullOrEmpty(tag)
                ? await FetchPreferredHy4ReleaseAsync().ConfigureAwait(false)
                    ?? await GetLatestReleaseAsync(false).ConfigureAwait(false)
                : await GetReleaseByTagAsync(tag).ConfigureAwait(false);
            if (release.Assets.Count == 0) throw new InvalidOperationException("No compatible llama.cpp release asset was found");

            // Desktop app is Windows x64. Prefer a small CPU build so it works
            // on machines without an NVIDIA GPU; CUDA builds are ~300 MB.
            var candidates = release.Assets
                .Where(a => a.Platform == "win" && a.Arch == "x64")
                .ToList();
            if (candidates.Count == 0) candidates = release.Assets.ToList();
            var asset = candidates
                .OrderBy(a => a.IsCuda ? 1 : 0)
                .ThenBy(a => a.Size)
                .First();
            // Placeholder validation: the real asset list comes from the API.
            if (!IsReleaseAssetUrl(asset.Url)) throw new InvalidOperationException("Invalid release asset URL");
            if (asset.Size > MaxAssetBytes) throw new InvalidOperationException("Release asset is too large");

            string tempDir = Directory.CreateTempSubdirectory("oxygen-llama-").FullName;
            try
            {
                string archive = Path.Combine(tempDir, asset.Name);
                await DownloadVerifiedAsync(asset, archive, progress, ct).ConfigureAwait(false);
                string extractDir = Path.Combine(tempDir, "extracted");
                Directory.CreateDirectory(extractDir);
                // Detect by magic bytes, not extension: an earlier release worker
                // shipped an uncompressed TAR named "llama-win-x64.zip".
                bool isZip;
                using (var probe = File.OpenRead(archive))
                {
                    var magic = new byte[4];
                    int read = await probe.ReadAsync(magic, ct).ConfigureAwait(false);
                    isZip = read >= 2 && magic[0] == (byte)'P' && magic[1] == (byte)'K';
                }
                if (isZip)
                    ZipFile.ExtractToDirectory(archive, extractDir);
                else if (asset.Name.EndsWith(".gz", StringComparison.OrdinalIgnoreCase) ||
                         asset.Name.EndsWith(".tgz", StringComparison.OrdinalIgnoreCase))
                    await ExtractTarGzAsync(archive, extractDir, ct).ConfigureAwait(false);
                else
                    ExtractTar(archive, extractDir);

                string? serverExe = Directory.GetFiles(extractDir, "llama-server.exe", SearchOption.AllDirectories).FirstOrDefault()
                    ?? Directory.GetFiles(extractDir, "llama-server", SearchOption.AllDirectories).FirstOrDefault();
                if (serverExe == null) throw new InvalidOperationException("The release archive did not contain llama-server");

                // Stage into a new version directory, then swap atomically.
                string stageDir = Path.Combine(BinaryDirectory, ".stage-" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(stageDir);
                try
                {
                    CopyDirectory(extractDir, stageDir);
                    string? oldDir = null;
                    lock (_sync)
                    {
                        var currentExe = FindServerExecutable();
                        if (currentExe != null) oldDir = Path.GetDirectoryName(currentExe);
                        var finalDir = Path.Combine(BinaryDirectory, "llama-" + Sanitize(release.Version));
                        if (Directory.Exists(finalDir)) Directory.Delete(finalDir, true);
                        Directory.Move(stageDir, finalDir);
                        _config.InstalledVersion = release.Version;
                        _config.IgnoredVersion = "";
                        SaveConfig();
                    }
                    if (oldDir != null && !string.IsNullOrEmpty(oldDir))
                    {
                        try { if (!Path.GetFullPath(oldDir).StartsWith(Path.GetFullPath(BinaryDirectory), StringComparison.OrdinalIgnoreCase)) Directory.Delete(oldDir, true); }
                        catch { /* best-effort cleanup */ }
                    }
                }
                catch { try { Directory.Delete(stageDir, true); } catch { } throw; }
            }
            finally
            {
                try { Directory.Delete(tempDir, true); } catch { }
            }
        }

        public void Uninstall()
        {
            lock (_sync)
            {
                StopAll();
                if (Directory.Exists(BinaryDirectory))
                {
                    foreach (var dir in Directory.GetDirectories(BinaryDirectory))
                    {
                        try { Directory.Delete(dir, true); } catch { }
                    }
                    foreach (var file in Directory.GetFiles(BinaryDirectory))
                    {
                        try { File.Delete(file); } catch { }
                    }
                }
                _config.InstalledVersion = "";
                SaveConfig();
            }
        }

        private async Task DownloadVerifiedAsync(AssetInfo asset, string destination, Action<int>? progress, CancellationToken ct)
        {
            using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false });
            string url = asset.Url;
            HttpResponseMessage? response = null;
            try
            {
                for (int redirects = 0; redirects <= 5; redirects++)
                {
                    if (!IsReleaseAssetUrl(url)) throw new InvalidOperationException("Invalid download destination");
                    response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
                    int code = (int)response.StatusCode;
                    if (code >= 300 && code < 400)
                    {
                        var location = response.Headers.Location;
                        response.Dispose(); response = null;
                        if (location == null || redirects == 5) throw new InvalidOperationException("Invalid download redirect");
                        url = new Uri(new Uri(url), location).AbsoluteUri;
                        continue;
                    }
                    break;
                }
                if (response == null) throw new InvalidOperationException("No download response");
                response.EnsureSuccessStatusCode();
                using var stream = await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
                using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
                using var output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None);
                var buffer = new byte[81920];
                long total = 0;
                int read;
                while ((read = await stream.ReadAsync(buffer, ct).ConfigureAwait(false)) > 0)
                {
                    total += read;
                    if (asset.Size > 0 && total > asset.Size) throw new InvalidOperationException("Download size mismatch");
                    hash.AppendData(buffer, 0, read);
                    await output.WriteAsync(buffer.AsMemory(0, read), ct).ConfigureAwait(false);
                    progress?.Invoke(asset.Size > 0 ? (int)Math.Min(99, total * 100 / asset.Size) : 0);
                }
                if (asset.Size > 0 && total != asset.Size) throw new InvalidOperationException("Download size mismatch");
                if (asset.Digest.Length > 0)
                {
                    var expected = Convert.FromHexString(asset.Digest.Substring(7));
                    if (!CryptographicOperations.FixedTimeEquals(hash.GetHashAndReset(), expected))
                        throw new InvalidOperationException("Download integrity check failed");
                }
                progress?.Invoke(100);
            }
            finally { response?.Dispose(); }
        }

        /// <summary>
        /// Minimal, dependency-free extraction of uncompressed TAR archives.
        /// Only regular files and directories are extracted; paths are confined
        /// to the destination directory.
        /// </summary>
        private static void ExtractTar(string archive, string destination)
        {
            string root = Path.GetFullPath(destination);
            using var fs = File.OpenRead(archive);
            var header = new byte[512];
            while (ReadBlock(fs, header) == 512)
            {
                if (header.All(b => b == 0)) break; // end-of-archive marker
                string name = ReadAscii(header, 0, 100).TrimEnd('\0');
                string prefix = ReadAscii(header, 345, 155).TrimEnd('\0');
                if (prefix.Length > 0) name = prefix + "/" + name;
                string sizeField = ReadAscii(header, 124, 12).Trim('\0', ' ');
                long size;
                try { size = Convert.ToInt64(sizeField, 8); } // TAR sizes are octal
                catch { throw new InvalidDataException("Invalid TAR entry size"); }
                if (size < 0) throw new InvalidDataException("Invalid TAR entry size");
                char type = (char)header[156];
                name = name.Replace('\\', '/');
                while (name.StartsWith("./", StringComparison.Ordinal)) name = name.Substring(2);
                if (string.IsNullOrWhiteSpace(name)) continue;

                string target = Path.GetFullPath(Path.Combine(destination, name));
                string rootWithSep = root + Path.DirectorySeparatorChar;
                if (!target.StartsWith(rootWithSep, StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(target, root, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("Invalid path in TAR archive");

                if (type == '5' || name.EndsWith("/", StringComparison.Ordinal))
                {
                    Directory.CreateDirectory(target);
                    continue;
                }
                if (type != '0' && type != '\0' && type != '7')
                    continue; // skip links/devices/other special entries

                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                using var output = File.Create(target);
                long remaining = size;
                var buffer = new byte[81920];
                while (remaining > 0)
                {
                    int toRead = (int)Math.Min(remaining, buffer.Length);
                    int read = fs.Read(buffer, 0, toRead);
                    if (read <= 0) throw new InvalidDataException("Truncated TAR archive");
                    output.Write(buffer, 0, read);
                    remaining -= read;
                }
                long padding = (512 - (size % 512)) % 512;
                if (padding > 0)
                {
                    ReadBlock(fs, new byte[padding]);
                }
            }
        }

        private static int ReadBlock(Stream stream, byte[] buffer)
        {
            int total = 0;
            while (total < buffer.Length)
            {
                int read = stream.Read(buffer, total, buffer.Length - total);
                if (read == 0) break;
                total += read;
            }
            return total;
        }

        private static string ReadAscii(byte[] data, int offset, int length) =>
            System.Text.Encoding.ASCII.GetString(data, offset, length);

        private static async Task ExtractTarGzAsync(string archive, string destination, CancellationToken ct)
        {
            // .NET has no built-in tar reader without a package; use tar if available.
            var psi = new ProcessStartInfo
            {
                FileName = "tar",
                Arguments = $"-xzf \"{archive}\" -C \"{destination}\"",
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var p = Process.Start(psi) ?? throw new InvalidOperationException("Could not start tar");
            await p.WaitForExitAsync(ct).ConfigureAwait(false);
            if (p.ExitCode != 0) throw new InvalidOperationException("Failed to extract llama.cpp archive");
        }

        private static void CopyDirectory(string source, string destination)
        {
            foreach (string dir in Directory.GetDirectories(source, "*", SearchOption.AllDirectories))
                Directory.CreateDirectory(Path.Combine(destination, Path.GetRelativePath(source, dir)));
            foreach (string file in Directory.GetFiles(source, "*.*", SearchOption.AllDirectories))
            {
                string target = Path.Combine(destination, Path.GetRelativePath(source, file));
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                File.Copy(file, target, true);
            }
        }

        private static string Sanitize(string value) =>
            new string(value.Select(c => char.IsLetterOrDigit(c) || c == '-' || c == '_' ? c : '_').ToArray());

        // ─── Model files ─────────────────────────────────────────────────────

        public string ResolveModelPath(string fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName)) throw new InvalidOperationException("Model file name is required");
            string name = Path.GetFileName(fileName);
            if (name != fileName || name.Contains("..")) throw new InvalidOperationException("Invalid model file name");
            string full = Path.GetFullPath(Path.Combine(ModelsDirectory, name));
            string root = Path.GetFullPath(ModelsDirectory) + Path.DirectorySeparatorChar;
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Path traversal detected");
            return full;
        }

        private static readonly System.Text.RegularExpressions.Regex ShardPattern =
            new System.Text.RegularExpressions.Regex(
                @"^(?<base>.+?)-(?<idx>\d{5})-of-(?<total>\d{5})\.gguf$",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Compiled);

        private static int ShardIndex(string fileName)
        {
            var m = ShardPattern.Match(fileName);
            return m.Success && int.TryParse(m.Groups["idx"].Value, out int n) ? n : int.MaxValue;
        }

        /// <summary>
        /// Groups .gguf files into models. Split models named
        /// "base-00001-of-00002.gguf" become one group; mmproj files are attached
        /// to the matching model family for vision support.
        ///
        /// Models live either in the app's models folder (legacy copies) or at
        /// the location they were imported from (recorded in the state file).
        /// </summary>
        private List<ModelGroup> BuildModelGroups()
        {
            Directory.CreateDirectory(ModelsDirectory);
            var groups = new Dictionary<string, ModelGroup>(StringComparer.OrdinalIgnoreCase);

            // 1) Models physically stored in the app's own models folder.
            var files = Directory.GetFiles(ModelsDirectory)
                .Where(f => f.EndsWith(".gguf", StringComparison.OrdinalIgnoreCase)).ToList();
            var projectors = new List<string>();
            foreach (var file in files)
            {
                string name = Path.GetFileName(file);
                if (name.StartsWith("mmproj", StringComparison.OrdinalIgnoreCase))
                {
                    projectors.Add(file);
                    continue;
                }
                var match = ShardPattern.Match(name);
                string id = match.Success ? match.Groups["base"].Value : name;
                int expected = match.Success && int.TryParse(match.Groups["total"].Value, out int total)
                    ? Math.Max(1, total) : 1;
                if (!groups.TryGetValue(id, out var group))
                {
                    group = new ModelGroup { Id = id, ExpectedShards = expected };
                    groups[id] = group;
                }
                group.ExpectedShards = Math.Max(group.ExpectedShards, expected);
                group.Shards.Add(name);
                group.ShardPaths.Add(file);
                try { group.SizeBytes += new FileInfo(file).Length; } catch { }
            }

            foreach (var group in groups.Values)
            {
                var ordered = group.Shards
                    .Select((name, i) => (name, path: group.ShardPaths[i]))
                    .OrderBy(t => ShardIndex(t.name))
                    .ToList();
                group.Shards = ordered.Select(t => t.name).ToList();
                group.ShardPaths = ordered.Select(t => t.path).ToList();
                string family = FamilyOf(group.Id);
                string? projector = projectors.FirstOrDefault(p => FamilyOf(Path.GetFileName(p)) == family)
                    ?? projectors.FirstOrDefault(p => Path.GetFileName(p).ToLowerInvariant().Contains(family));
                if (projector != null)
                {
                    group.Mmproj = Path.GetFileName(projector);
                    group.MmprojPath = projector;
                }
            }

            // 2) Models imported by reference: use the files in place.
            foreach (var kv in _state.Models)
            {
                var settings = kv.Value;
                if (settings.Paths == null || settings.Paths.Count == 0) continue;
                var paths = settings.Paths
                    .Where(p => !string.IsNullOrWhiteSpace(p))
                    .Select(p => { try { return Path.GetFullPath(p); } catch { return ""; } })
                    .Where(p => p.Length > 0)
                    .ToList();
                if (paths.Count == 0) continue;

                if (!groups.TryGetValue(kv.Key, out var group))
                {
                    group = new ModelGroup { Id = kv.Key };
                    groups[kv.Key] = group;
                }
                group.Referenced = true;
                var orderedPaths = paths
                    .Select(p => (name: Path.GetFileName(p) ?? "", path: p))
                    .OrderBy(t => ShardIndex(t.name))
                    .ToList();
                group.Shards = orderedPaths.Select(t => t.name).ToList();
                group.ShardPaths = orderedPaths.Select(t => t.path).ToList();
                group.ExpectedShards = orderedPaths
                    .Select(t => ShardPattern.Match(t.name))
                    .Where(m => m.Success && int.TryParse(m.Groups["total"].Value, out _))
                    .Select(m => int.Parse(m.Groups["total"].Value))
                    .DefaultIfEmpty(1).Max();
                group.SizeBytes = orderedPaths.Sum(t =>
                {
                    try { return new FileInfo(t.path).Length; } catch { return 0L; }
                });
                group.Mmproj = settings.Mmproj;
                if (!string.IsNullOrWhiteSpace(settings.MmprojPath))
                    group.MmprojPath = settings.MmprojPath;
                else if (!string.IsNullOrWhiteSpace(settings.Mmproj))
                    group.MmprojPath = SafeResolveModelPath(settings.Mmproj);
            }

            return groups.Values.OrderBy(g => g.Id).ToList();
        }

        private static string FamilyOf(string nameOrId)
        {
            string value = nameOrId;
            if (value.StartsWith("mmproj", StringComparison.OrdinalIgnoreCase))
                value = value.Substring("mmproj".Length).TrimStart('-', '_', '.');
            if (value.EndsWith(".gguf", StringComparison.OrdinalIgnoreCase))
                value = value.Substring(0, value.Length - ".gguf".Length);
            return string.Join("-", value.Split('-').Take(2)).ToLowerInvariant();
        }

        private static bool IsInsideModelsDirectory(string path)
        {
            try
            {
                string root = Path.GetFullPath(ModelsDirectory) + Path.DirectorySeparatorChar;
                return Path.GetFullPath(path).StartsWith(root, StringComparison.OrdinalIgnoreCase);
            }
            catch { return false; }
        }

        private static string SafeResolveModelPath(string fileName)
        {
            try { return Path.GetFullPath(Path.Combine(ModelsDirectory, Path.GetFileName(fileName))); }
            catch { return ""; }
        }

        /// <summary>Absolute mmproj path, preferring an imported file over a copied one.</summary>
        private static string ResolveMmprojPath(ModelSettings? settings, ModelGroup group)
        {
            if (settings != null && !string.IsNullOrWhiteSpace(settings.MmprojPath) &&
                File.Exists(settings.MmprojPath))
                return settings.MmprojPath;
            string name = !string.IsNullOrWhiteSpace(settings?.Mmproj) ? settings!.Mmproj : group.Mmproj;
            if (string.IsNullOrWhiteSpace(name)) return "";
            if (!string.IsNullOrWhiteSpace(group.MmprojPath) &&
                string.Equals(Path.GetFileName(group.MmprojPath), name, StringComparison.OrdinalIgnoreCase))
                return group.MmprojPath;
            return SafeResolveModelPath(name);
        }

        private ModelSettings? FindSettings(string id, ModelGroup group)
        {
            if (_state.Models.TryGetValue(id, out var settings)) return settings;
            // Migrate legacy settings stored under the first shard's filename.
            if (group.Shards.Count > 0 && _state.Models.TryGetValue(group.Shards[0], out settings))
                return settings;
            return null;
        }

        public List<object> ListModels()
        {
            var result = new List<object>();
            foreach (var group in BuildModelGroups())
            {
                var settings = FindSettings(group.Id, group);
                string mmprojPath = ResolveMmprojPath(settings, group);
                bool hasVision = !string.IsNullOrWhiteSpace(mmprojPath) && File.Exists(mmprojPath);
                bool complete = group.Shards.Count >= group.ExpectedShards &&
                                group.ShardPaths.All(File.Exists);
                result.Add(new
                {
                    id = group.Id,
                    fileName = group.Shards.Count > 0 ? group.Shards[0] : "",
                    displayName = settings?.DisplayName ?? group.Id,
                    source = settings?.Source ?? "manual",
                    sourceId = settings?.SourceId ?? "",
                    mmap = settings?.Mmap ?? true,
                    contextSize = settings?.ContextSize ?? 4096,
                    gpuLayers = settings?.GpuLayers ?? -1,
                    port = settings?.Port ?? 0,
                    sizeBytes = group.SizeBytes,
                    isRunning = settings != null && _processes.ContainsKey(settings.Port),
                    shards = group.Shards.ToArray(),
                    shardCount = group.Shards.Count,
                    shardExpected = group.ExpectedShards,
                    shardsComplete = complete,
                    hasVision = hasVision,
                    mmproj = hasVision ? Path.GetFileName(mmprojPath) : "",
                    useJinja = settings?.UseJinja ?? false,
                    referenced = group.Referenced
                });
            }
            return result;
        }

        public void SaveModelSettings(string modelId, ModelSettings settings)
        {
            var existing = _state.Models.TryGetValue(modelId, out var old) ? old : new ModelSettings();
            existing.Id = modelId;
            if (!string.IsNullOrWhiteSpace(settings.FileName)) existing.FileName = Path.GetFileName(settings.FileName);
            existing.DisplayName = string.IsNullOrWhiteSpace(settings.DisplayName) ? existing.DisplayName ?? modelId : settings.DisplayName;
            existing.Source = settings.Source ?? existing.Source;
            existing.SourceId = settings.SourceId ?? existing.SourceId;
            // For referenced models the shard list is authoritative from Paths.
            if (!(existing.Paths != null && existing.Paths.Count > 0) &&
                settings.Shards != null && settings.Shards.Count > 0)
                existing.Shards = settings.Shards.Select(s => Path.GetFileName(s) ?? s).ToList();
            if (!string.IsNullOrWhiteSpace(settings.Mmproj))
            {
                string name = Path.GetFileName(settings.Mmproj);
                existing.Mmproj = name;
                if (!string.IsNullOrWhiteSpace(settings.MmprojPath) &&
                    string.Equals(Path.GetFileName(settings.MmprojPath), name, StringComparison.OrdinalIgnoreCase))
                    existing.MmprojPath = Path.GetFullPath(settings.MmprojPath);
            }
            existing.UseJinja = settings.UseJinja;
            existing.Mmap = settings.Mmap;
            existing.ContextSize = settings.ContextSize > 0 ? settings.ContextSize : 4096;
            existing.GpuLayers = settings.GpuLayers;
            existing.Port = settings.Port;
            _state.Models[modelId] = existing;
            SaveState();
        }

        private sealed class ImportEntry
        {
            public List<string> Shards { get; } = new List<string>();
            public string MmprojPath { get; set; } = "";
        }

        /// <summary>
        /// Registers GGUF files at their current location. Nothing is copied or
        /// moved, so large models load straight from where the user keeps them.
        /// </summary>
        public List<string> ImportModels(IEnumerable<string> sourcePaths)
        {
            var models = new Dictionary<string, ImportEntry>(StringComparer.OrdinalIgnoreCase);
            var projectors = new List<string>();

            foreach (var source in sourcePaths)
            {
                if (string.IsNullOrWhiteSpace(source)) continue;
                string full;
                try { full = Path.GetFullPath(source); } catch { continue; }
                if (!File.Exists(full) ||
                    !full.EndsWith(".gguf", StringComparison.OrdinalIgnoreCase)) continue;
                string name = Path.GetFileName(full);
                if (name.StartsWith("mmproj", StringComparison.OrdinalIgnoreCase))
                {
                    projectors.Add(full);
                    continue;
                }
                var match = ShardPattern.Match(name);
                string id = match.Success ? match.Groups["base"].Value : name;
                if (!models.TryGetValue(id, out var entry))
                {
                    entry = new ImportEntry();
                    models[id] = entry;
                }
                if (!entry.Shards.Contains(full, StringComparer.OrdinalIgnoreCase))
                    entry.Shards.Add(full);
            }

            if (models.Count == 0 && projectors.Count == 0)
                throw new InvalidOperationException("No GGUF files were selected");

            // Attach mmproj files to the model family they belong to.
            var known = BuildModelGroups();
            foreach (var projector in projectors)
            {
                string family = FamilyOf(Path.GetFileName(projector));
                string? id = models.Keys.FirstOrDefault(k => FamilyOf(k) == family)
                    ?? known.FirstOrDefault(g => FamilyOf(g.Id) == family)?.Id;
                if (id == null) continue;
                if (!models.TryGetValue(id, out var entry))
                {
                    entry = new ImportEntry();
                    models[id] = entry;
                }
                entry.MmprojPath = projector;
            }

            var ids = new List<string>();
            foreach (var kv in models)
            {
                string id = kv.Key;
                var entry = kv.Value;
                entry.Shards.Sort((a, b) =>
                    ShardIndex(Path.GetFileName(a)).CompareTo(ShardIndex(Path.GetFileName(b))));

                if (!_state.Models.TryGetValue(id, out var settings))
                {
                    settings = new ModelSettings
                    {
                        Id = id,
                        DisplayName = id,
                        Mmap = true,
                        UseJinja = id.IndexOf("hy4", StringComparison.OrdinalIgnoreCase) >= 0
                    };
                }

                if (entry.Shards.Count > 0)
                {
                    var merged = new List<string>(entry.Shards);
                    // Keep other shards of the same model that were imported from
                    // the same folder earlier.
                    string dir = Path.GetDirectoryName(entry.Shards[0]) ?? "";
                    if (settings.Paths != null)
                        foreach (var p in settings.Paths)
                            if (string.Equals(Path.GetDirectoryName(p), dir, StringComparison.OrdinalIgnoreCase) &&
                                !merged.Contains(p, StringComparer.OrdinalIgnoreCase))
                                merged.Add(p);
                    merged.Sort((a, b) =>
                        ShardIndex(Path.GetFileName(a)).CompareTo(ShardIndex(Path.GetFileName(b))));

                    settings.Id = id;
                    settings.FileName = Path.GetFileName(merged[0]);
                    settings.Shards = merged.Select(p => Path.GetFileName(p) ?? p).ToList();
                    settings.Paths = merged;
                }

                if (!string.IsNullOrWhiteSpace(entry.MmprojPath))
                {
                    settings.Mmproj = Path.GetFileName(entry.MmprojPath);
                    settings.MmprojPath = entry.MmprojPath;
                }
                else if (string.IsNullOrWhiteSpace(settings.MmprojPath))
                {
                    var group = known.FirstOrDefault(g => g.Id.Equals(id, StringComparison.OrdinalIgnoreCase));
                    if (group != null && !string.IsNullOrWhiteSpace(group.MmprojPath))
                    {
                        settings.Mmproj = group.Mmproj;
                        settings.MmprojPath = group.MmprojPath;
                    }
                }

                _state.Models[id] = settings;
                ids.Add(id);
            }
            if (ids.Count == 0)
                throw new InvalidOperationException("No GGUF model files were selected");
            SaveState();
            return ids;
        }

        public void DeleteModel(string modelId)
        {
            var group = BuildModelGroups().FirstOrDefault(
                g => g.Id.Equals(modelId, StringComparison.OrdinalIgnoreCase) ||
                     g.Shards.Contains(modelId, StringComparer.OrdinalIgnoreCase));
            if (group != null)
            {
                // Imported-by-reference files belong to the user: only forget them.
                // Files copied into our own models folder are ours to delete.
                foreach (var path in group.ShardPaths)
                    if (IsInsideModelsDirectory(path) && File.Exists(path)) File.Delete(path);
                if (!string.IsNullOrWhiteSpace(group.MmprojPath) && IsInsideModelsDirectory(group.MmprojPath))
                {
                    bool usedElsewhere = BuildModelGroups().Any(g =>
                        !string.Equals(g.Id, group.Id, StringComparison.OrdinalIgnoreCase) &&
                        string.Equals(g.MmprojPath, group.MmprojPath, StringComparison.OrdinalIgnoreCase));
                    if (!usedElsewhere && File.Exists(group.MmprojPath)) File.Delete(group.MmprojPath);
                }
                _state.Models.Remove(group.Id);
            }
            // Remove any legacy key stored under the file name.
            _state.Models.Remove(Path.GetFileName(modelId));
            SaveState();
        }

        public string? ReadModelFile(string fileName)
        {
            string full = ResolveModelPath(fileName);
            if (!File.Exists(full)) return null;
            return full;
        }

        // ─── Process lifecycle ───────────────────────────────────────────────

        public int Start(string modelId, int port, bool mmap, int contextSize, int gpuLayers)
        {
            string serverExe = FindServerExecutable() ?? throw new InvalidOperationException("llama.cpp is not installed");
            var group = BuildModelGroups().FirstOrDefault(
                g => g.Id.Equals(modelId, StringComparison.OrdinalIgnoreCase) ||
                     g.Shards.Contains(modelId, StringComparer.OrdinalIgnoreCase))
                ?? throw new InvalidOperationException("Model not found");
            if (group.Shards.Count < group.ExpectedShards)
                throw new InvalidOperationException($"Model is incomplete: {group.Shards.Count}/{group.ExpectedShards} shards present");
            string modelPath = group.ShardPaths.Count > 0 ? group.ShardPaths[0] : "";
            if (string.IsNullOrWhiteSpace(modelPath) || !File.Exists(modelPath))
                throw new InvalidOperationException("Model file not found");
            var settings = FindSettings(group.Id, group);

            int instanceId = _nextInstanceId++;
            if (port <= 0) port = 8100 + (instanceId % 100);
            // If the chosen port is taken, find a free one.
            for (int attempts = 0; attempts < 100; attempts++)
            {
                try { EnsurePortFree(port); break; }
                catch { port++; }
            }
            EnsurePortFree(port);

            string args = $"-m \"{modelPath}\" --host 127.0.0.1 --port {port} -c {Math.Clamp(contextSize, 512, 131072)}";
            // llama.cpp auto-discovers sibling shards from the -0000N-of-0000M
            // naming pattern in the same directory, so only shard 1 is passed.
            if (mmap) args += " --mmap";
            if (gpuLayers >= 0) args += $" -ngl {Math.Min(gpuLayers, 9999)}";
            string mmproj = ResolveMmprojPath(settings, group);
            if (!string.IsNullOrWhiteSpace(mmproj) && File.Exists(mmproj))
                args += $" --mmproj \"{mmproj}\"";
            if (settings?.UseJinja == true) args += " --jinja";

            var psi = new ProcessStartInfo
            {
                FileName = serverExe,
                Arguments = args,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                WorkingDirectory = Path.GetDirectoryName(serverExe)!
            };
            var process = new Process { StartInfo = psi, EnableRaisingEvents = true };
            process.Exited += (_, _) => _processes.TryRemove(port, out _);
            if (!process.Start()) throw new InvalidOperationException("Failed to start llama-server");
            _processes[port] = process;

            if (settings == null) settings = new ModelSettings();
            settings.Port = port;
            settings.Mmap = mmap;
            settings.ContextSize = contextSize;
            settings.GpuLayers = gpuLayers;
            settings.DisplayName = string.IsNullOrEmpty(settings.DisplayName) ? group.Id : settings.DisplayName;
            settings.FileName = group.Shards[0];
            settings.Shards = group.Shards.ToList();
            if (string.IsNullOrWhiteSpace(settings.Mmproj)) settings.Mmproj = group.Mmproj;
            settings.Id = group.Id;
            _state.Models[group.Id] = settings;
            SaveState();

            return port;
        }

        public void Stop(int instanceId)
        {
            if (_processes.TryRemove(instanceId, out var process))
            {
                TryStop(process);
                foreach (var kv in _state.Models)
                {
                    if (kv.Value.Port == instanceId) { kv.Value.Port = 0; }
                }
                SaveState();
            }
        }

        public void StopAll()
        {
            foreach (var kv in _processes) TryStop(kv.Value);
            _processes.Clear();
            foreach (var kv in _state.Models) kv.Value.Port = 0;
            SaveState();
        }

        private static void TryStop(Process process)
        {
            try { if (!process.HasExited) { process.Kill(entireProcessTree: true); process.WaitForExit(5000); } }
            catch { }
            try { process.Dispose(); } catch { }
        }

        private static void EnsurePortFree(int port)
        {
            using var listener = new System.Net.Sockets.TcpListener(IPAddress.Loopback, port);
            try { listener.Start(); }
            catch (Exception ex) { throw new InvalidOperationException($"Port {port} is already in use", ex); }
            finally { listener.Stop(); }
        }

        public List<object> ListRunning()
        {
            var result = new List<object>();
            foreach (var kv in _state.Models)
            {
                int port = kv.Value.Port;
                if (port <= 0) continue;
                if (!_processes.TryGetValue(port, out var proc) || proc.HasExited) continue;
                result.Add(new
                {
                    instanceId = port,
                    port = port,
                    modelId = kv.Value.Id,
                    modelFile = kv.Key,
                    displayName = kv.Value.DisplayName,
                    baseUrl = $"http://127.0.0.1:{port}",
                    mmap = kv.Value.Mmap,
                    contextSize = kv.Value.ContextSize,
                    gpuLayers = kv.Value.GpuLayers,
                    hasVision = !string.IsNullOrWhiteSpace(kv.Value.Mmproj),
                    useJinja = kv.Value.UseJinja
                });
            }
            return result;
        }
    }
}
