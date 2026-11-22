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
            public bool Mmap { get; set; } = true;
            public int ContextSize { get; set; } = 4096;
            public int GpuLayers { get; set; } = -1;
            public int Port { get; set; } = 0;
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
            return await FetchReleaseAsync(ReleasesApiUrl).ConfigureAwait(false);
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

            // Prefer a CUDA build when available, otherwise a plain CPU build.
            var asset = release.Assets
                .OrderByDescending(a => a.IsCuda)
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
                if (asset.Name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                    ZipFile.ExtractToDirectory(archive, extractDir);
                else
                    await ExtractTarGzAsync(archive, extractDir, ct).ConfigureAwait(false);

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

        public List<object> ListModels()
        {
            Directory.CreateDirectory(ModelsDirectory);
            var result = new List<object>();
            foreach (var file in Directory.GetFiles(ModelsDirectory)
                         .Where(f => f.EndsWith(".gguf", StringComparison.OrdinalIgnoreCase)))
            {
                string name = Path.GetFileName(file);
                _state.Models.TryGetValue(name, out var settings);
                result.Add(new
                {
                    id = settings?.Id ?? name,
                    fileName = name,
                    displayName = settings?.DisplayName ?? name,
                    source = settings?.Source ?? "manual",
                    sourceId = settings?.SourceId ?? "",
                    mmap = settings?.Mmap ?? true,
                    contextSize = settings?.ContextSize ?? 4096,
                    gpuLayers = settings?.GpuLayers ?? -1,
                    port = settings?.Port ?? 0,
                    sizeBytes = new FileInfo(file).Length,
                    isRunning = settings != null && _processes.ContainsKey(settings.Port)
                });
            }
            return result;
        }

        public void SaveModelSettings(string fileName, ModelSettings settings)
        {
            string safe = Path.GetFileName(fileName);
            var existing = _state.Models.TryGetValue(safe, out var old) ? old : new ModelSettings();
            existing.Id = settings.Id ?? existing.Id ?? safe;
            existing.FileName = safe;
            existing.DisplayName = string.IsNullOrWhiteSpace(settings.DisplayName) ? existing.DisplayName ?? safe : settings.DisplayName;
            existing.Source = settings.Source ?? existing.Source;
            existing.SourceId = settings.SourceId ?? existing.SourceId;
            existing.Mmap = settings.Mmap;
            existing.ContextSize = settings.ContextSize > 0 ? settings.ContextSize : 4096;
            existing.GpuLayers = settings.GpuLayers;
            existing.Port = settings.Port;
            _state.Models[safe] = existing;
            SaveState();
        }

        public void DeleteModel(string fileName)
        {
            string full = ResolveModelPath(fileName);
            if (File.Exists(full)) File.Delete(full);
            _state.Models.Remove(Path.GetFileName(fileName));
            SaveState();
        }

        public async Task SaveUploadedModelAsync(string fileName, byte[] data, ModelSettings? settings = null, Action<int>? progress = null, CancellationToken ct = default)
        {
            if ((long)data.Length > 32L * 1024 * 1024 * 1024) throw new InvalidOperationException("Model file is too large");
            string full = ResolveModelPath(fileName);
            const int chunk = 1 << 20;
            using (var fs = new FileStream(full + ".upload", FileMode.Create, FileAccess.Write, FileShare.None))
            {
                for (int offset = 0; offset < data.Length; offset += chunk)
                {
                    int len = Math.Min(chunk, data.Length - offset);
                    await fs.WriteAsync(data.AsMemory(offset, len), ct).ConfigureAwait(false);
                    progress?.Invoke((int)((long)offset * 100 / Math.Max(1, data.Length)));
                }
            }
            if (File.Exists(full)) File.Delete(full);
            File.Move(full + ".upload", full);
            if (settings != null) SaveModelSettings(fileName, settings);
            progress?.Invoke(100);
        }

        public string? ReadModelFile(string fileName)
        {
            string full = ResolveModelPath(fileName);
            if (!File.Exists(full)) return null;
            return full;
        }

        // ─── Process lifecycle ───────────────────────────────────────────────

        public int Start(string modelFileName, int port, bool mmap, int contextSize, int gpuLayers)
        {
            string serverExe = FindServerExecutable() ?? throw new InvalidOperationException("llama.cpp is not installed");
            string modelPath = ResolveModelPath(modelFileName);
            if (!File.Exists(modelPath)) throw new InvalidOperationException("Model file not found");

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
            if (mmap) args += " --mmap";
            if (gpuLayers >= 0) args += $" -ngl {Math.Min(gpuLayers, 9999)}";

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

            _state.Models.TryGetValue(Path.GetFileName(modelFileName), out var settings);
            if (settings == null) settings = new ModelSettings();
            settings.Port = port;
            settings.Mmap = mmap;
            settings.ContextSize = contextSize;
            settings.GpuLayers = gpuLayers;
            settings.DisplayName = string.IsNullOrEmpty(settings.DisplayName) ? Path.GetFileName(modelFileName) : settings.DisplayName;
            settings.FileName = Path.GetFileName(modelFileName);
            settings.Id = string.IsNullOrEmpty(settings.Id) ? Path.GetFileName(modelFileName) : settings.Id;
            _state.Models[Path.GetFileName(modelFileName)] = settings;
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
                    gpuLayers = kv.Value.GpuLayers
                });
            }
            return result;
        }
    }
}
