using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace DesktopApp;

public static class GameIconExtractor
{
    private static readonly ConcurrentDictionary<string, string> _memoryCache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly string _diskCacheDirectory;

    static GameIconExtractor()
    {
        try
        {
            var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            _diskCacheDirectory = Path.Combine(localAppData, "OxygenLowsSoftware", "GameIcons");
            if (!Directory.Exists(_diskCacheDirectory))
            {
                Directory.CreateDirectory(_diskCacheDirectory);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to initialize GameIconExtractor disk cache directory: {ex.Message}");
            _diskCacheDirectory = Path.Combine(Path.GetTempPath(), "OxygenLowsSoftware_GameIcons");
        }
    }

    /// <summary>
    /// Extracts an icon from an executable or image file and returns a PNG Base64 data URL.
    /// Uses Tier 1 (RAM) and Tier 2 (Disk) caching.
    /// </summary>
    public static string? ExtractIconAsDataUrl(string? targetPath, string? cacheKey = null)
    {
        if (string.IsNullOrWhiteSpace(targetPath)) return null;

        var normalizedKey = !string.IsNullOrWhiteSpace(cacheKey)
            ? cacheKey.Trim().ToLowerInvariant()
            : targetPath.Trim().ToLowerInvariant();

        // 1. Check RAM Cache
        if (_memoryCache.TryGetValue(normalizedKey, out var cachedDataUrl))
        {
            return cachedDataUrl;
        }

        // 2. Check Disk Cache
        var diskCacheFile = GetDiskCacheFilePath(normalizedKey);
        try
        {
            if (File.Exists(diskCacheFile))
            {
                var diskBytes = File.ReadAllBytes(diskCacheFile);
                if (diskBytes.Length > 0)
                {
                    var dataUrl = $"data:image/png;base64,{Convert.ToBase64String(diskBytes)}";
                    _memoryCache[normalizedKey] = dataUrl;
                    return dataUrl;
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to read icon from disk cache: {ex.Message}");
        }

        // 3. Extract Icon from File
        try
        {
            if (!File.Exists(targetPath)) return null;

            var ext = Path.GetExtension(targetPath).ToLowerInvariant();
            byte[]? pngBytes = null;

            if (ext == ".ico")
            {
                using var icon = new Icon(targetPath);
                using var bmp = icon.ToBitmap();
                using var ms = new MemoryStream();
                bmp.Save(ms, ImageFormat.Png);
                pngBytes = ms.ToArray();
            }
            else if (ext == ".png")
            {
                pngBytes = File.ReadAllBytes(targetPath);
            }
            else if (ext == ".jpg" || ext == ".jpeg" || ext == ".bmp")
            {
                using var image = Image.FromFile(targetPath);
                using var ms = new MemoryStream();
                image.Save(ms, ImageFormat.Png);
                pngBytes = ms.ToArray();
            }
            else if (ext == ".exe" || ext == ".dll")
            {
                using var icon = Icon.ExtractAssociatedIcon(targetPath);
                if (icon != null)
                {
                    using var bmp = icon.ToBitmap();
                    using var ms = new MemoryStream();
                    bmp.Save(ms, ImageFormat.Png);
                    pngBytes = ms.ToArray();
                }
            }

            if (pngBytes != null && pngBytes.Length > 0)
            {
                // Save to Disk Cache
                try
                {
                    if (!Directory.Exists(_diskCacheDirectory))
                    {
                        Directory.CreateDirectory(_diskCacheDirectory);
                    }
                    File.WriteAllBytes(diskCacheFile, pngBytes);
                }
                catch (Exception diskEx)
                {
                    Debug.WriteLine($"Failed to write icon to disk cache: {diskEx.Message}");
                }

                var dataUrl = $"data:image/png;base64,{Convert.ToBase64String(pngBytes)}";
                _memoryCache[normalizedKey] = dataUrl;
                return dataUrl;
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Failed to extract icon from {targetPath}: {ex.Message}");
        }

        return null;
    }

    /// <summary>
    /// Asynchronous wrapper for icon extraction.
    /// </summary>
    public static Task<string?> ExtractIconAsDataUrlAsync(string? targetPath, string? cacheKey = null)
    {
        return Task.Run(() => ExtractIconAsDataUrl(targetPath, cacheKey));
    }

    private static string GetDiskCacheFilePath(string key)
    {
        using var sha = SHA256.Create();
        var hashBytes = sha.ComputeHash(Encoding.UTF8.GetBytes(key));
        var sb = new StringBuilder();
        foreach (var b in hashBytes)
        {
            sb.Append(b.ToString("x2"));
        }
        return Path.Combine(_diskCacheDirectory, $"{sb}.png");
    }
}
