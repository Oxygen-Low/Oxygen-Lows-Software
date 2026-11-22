using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace DesktopApp
{
    /// <summary>
    /// Shared, on-disk cache for GitHub release API responses.
    ///
    /// Unauthenticated GitHub API calls are limited to 60 requests/hour per IP.
    /// The app checks for llama.cpp and application updates in several places,
    /// so without caching those calls quickly exhaust the limit (especially on
    /// shared/NAT IPs). Responses are reused for an hour and revalidated with
    /// ETag; a 304 response does not count against the rate limit. When GitHub
    /// reports rate limiting, stale cached data is served instead of failing.
    /// </summary>
    internal static class GitHubReleaseCache
    {
        private sealed class Entry
        {
            public string Json { get; set; } = "";
            public string ETag { get; set; } = "";
            public DateTimeOffset FetchedAt { get; set; }
        }

        private static readonly string CachePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "OxygenLowsSoftware", "github-release-cache.json");
        private static readonly TimeSpan MaxAge = TimeSpan.FromHours(1);
        private static readonly SemaphoreSlim Gate = new SemaphoreSlim(1, 1);
        private static Dictionary<string, Entry> _entries = Load();

        private static Dictionary<string, Entry> Load()
        {
            try
            {
                if (!File.Exists(CachePath))
                    return new Dictionary<string, Entry>(StringComparer.OrdinalIgnoreCase);
                var loaded = JsonSerializer.Deserialize<Dictionary<string, Entry>>(File.ReadAllText(CachePath));
                return loaded == null
                    ? new Dictionary<string, Entry>(StringComparer.OrdinalIgnoreCase)
                    : new Dictionary<string, Entry>(loaded, StringComparer.OrdinalIgnoreCase);
            }
            catch
            {
                return new Dictionary<string, Entry>(StringComparer.OrdinalIgnoreCase);
            }
        }

        private static void Save()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(CachePath)!);
                string temp = CachePath + ".tmp";
                File.WriteAllText(temp, JsonSerializer.Serialize(_entries));
                File.Move(temp, CachePath, true);
            }
            catch (Exception ex) { Debug.WriteLine("GitHub cache save: " + ex.Message); }
        }

        /// <summary>
        /// Returns the cached or freshly fetched JSON body for an API URL.
        /// Network failures and rate limiting fall back to stale cached data.
        /// </summary>
        public static async Task<string> GetAsync(string url, HttpClient client, bool force = false)
        {
            await Gate.WaitAsync().ConfigureAwait(false);
            try
            {
                _entries.TryGetValue(url, out var cached);
                if (cached != null && !force && DateTimeOffset.UtcNow - cached.FetchedAt < MaxAge)
                    return cached.Json;

                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                if (cached != null && !string.IsNullOrEmpty(cached.ETag))
                    request.Headers.TryAddWithoutValidation("If-None-Match", cached.ETag);

                try
                {
                    using var response = await client.SendAsync(request).ConfigureAwait(false);

                    if (response.StatusCode == HttpStatusCode.NotModified && cached != null)
                    {
                        cached.FetchedAt = DateTimeOffset.UtcNow;
                        Save();
                        return cached.Json;
                    }

                    int code = (int)response.StatusCode;
                    if (code == 403 || code == 429)
                    {
                        if (cached != null) return cached.Json;
                        throw new InvalidOperationException("GitHub API rate limit reached. Please try again later.");
                    }

                    response.EnsureSuccessStatusCode();
                    string json = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    _entries[url] = new Entry
                    {
                        Json = json,
                        ETag = response.Headers.ETag?.Tag ?? "",
                        FetchedAt = DateTimeOffset.UtcNow
                    };
                    Save();
                    return json;
                }
                catch (HttpRequestException) when (cached != null) { return cached.Json; }
                catch (TaskCanceledException) when (cached != null) { return cached.Json; }
            }
            finally { Gate.Release(); }
        }
    }
}
