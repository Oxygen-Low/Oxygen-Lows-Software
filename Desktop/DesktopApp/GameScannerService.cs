using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using DesktopApp.Models;
using Microsoft.Win32;

namespace DesktopApp;

public static class GameScannerService
{
    private static readonly HashSet<string> ExcludedExecutableNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "unins000.exe", "uninstall.exe", "uninstaller.exe", "crashpad_handler.exe",
        "dxsetup.exe", "vcredist_x86.exe", "vcredist_x64.exe", "vc_redist.x64.exe", "vc_redist.x86.exe",
        "unitycrashhandler32.exe", "unitycrashhandler64.exe", "easyanticheat_setup.exe",
        "easyanticheat_eos_setup.exe", "battleye_setup.exe", "epicgameslauncher.exe",
        "steamservice.exe", "steamerrorreporter.exe", "gog_galaxy.exe", "uplay.exe",
        "upc.exe", "eaconnect_server.exe", "ea_desktop.exe", "origin.exe"
    };

    public static async Task<List<InstalledGame>> ScanAllAsync()
    {
        return await Task.Run(() => ScanAll());
    }

    public static List<InstalledGame> ScanAll()
    {
        var games = new List<InstalledGame>();
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void AddGames(IEnumerable<InstalledGame> scanned)
        {
            foreach (var g in scanned)
            {
                if (string.IsNullOrWhiteSpace(g.Id) || string.IsNullOrWhiteSpace(g.Title))
                    continue;

                if (seenIds.Add(g.Id))
                {
                    games.Add(g);
                }
            }
        }

        try { AddGames(ScanSteam()); } catch (Exception ex) { Debug.WriteLine($"Steam scan error: {ex.Message}"); }
        try { AddGames(ScanEpic()); } catch (Exception ex) { Debug.WriteLine($"Epic scan error: {ex.Message}"); }
        try { AddGames(ScanEA()); } catch (Exception ex) { Debug.WriteLine($"EA scan error: {ex.Message}"); }
        try { AddGames(ScanXbox()); } catch (Exception ex) { Debug.WriteLine($"Xbox scan error: {ex.Message}"); }
        try { AddGames(ScanGOG()); } catch (Exception ex) { Debug.WriteLine($"GOG scan error: {ex.Message}"); }
        try { AddGames(ScanUbisoft()); } catch (Exception ex) { Debug.WriteLine($"Ubisoft scan error: {ex.Message}"); }

        return games.OrderBy(g => g.Title).ToList();
    }

    #region 1. Steam Scanner

    public static List<InstalledGame> ScanSteam()
    {
        var games = new List<InstalledGame>();

        string? steamPath = null;
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam");
            steamPath = key?.GetValue("SteamPath") as string;
        }
        catch { }

        if (string.IsNullOrEmpty(steamPath))
        {
            try
            {
                using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\WOW6432Node\Valve\Steam")
                             ?? Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Valve\Steam");
                steamPath = key?.GetValue("InstallPath") as string;
            }
            catch { }
        }

        if (string.IsNullOrEmpty(steamPath) || !Directory.Exists(steamPath))
        {
            var defaultPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Steam");
            if (Directory.Exists(defaultPath))
                steamPath = defaultPath;
        }

        if (string.IsNullOrEmpty(steamPath) || !Directory.Exists(steamPath))
            return games;

        steamPath = Path.GetFullPath(steamPath);

        // Find library paths
        var libraryFolders = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { steamPath };

        var vdfPaths = new[]
        {
            Path.Combine(steamPath, "steamapps", "libraryfolders.vdf"),
            Path.Combine(steamPath, "config", "libraryfolders.vdf")
        };

        foreach (var vdfPath in vdfPaths)
        {
            if (!File.Exists(vdfPath)) continue;

            try
            {
                var content = File.ReadAllText(vdfPath);
                var matches = Regex.Matches(content, @"""path""\s+""([^""]+)""", RegexOptions.IgnoreCase);
                foreach (Match m in matches)
                {
                    var p = m.Groups[1].Value.Replace(@"\\", @"\");
                    if (Directory.Exists(p))
                    {
                        libraryFolders.Add(Path.GetFullPath(p));
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to parse VDF {vdfPath}: {ex.Message}");
            }
        }

        // Parse appmanifest files
        foreach (var lib in libraryFolders)
        {
            var steamappsDir = Path.Combine(lib, "steamapps");
            if (!Directory.Exists(steamappsDir)) continue;

            string[] acfFiles;
            try
            {
                acfFiles = Directory.GetFiles(steamappsDir, "appmanifest_*.acf");
            }
            catch
            {
                continue;
            }

            foreach (var acf in acfFiles)
            {
                try
                {
                    var content = File.ReadAllText(acf);
                    var appId = ExtractVdfValue(content, "appid");
                    var name = ExtractVdfValue(content, "name");
                    var installdir = ExtractVdfValue(content, "installdir");
                    var stateFlagsStr = ExtractVdfValue(content, "StateFlags");
                    var sizeStr = ExtractVdfValue(content, "SizeOnDisk");
                    var updatedStr = ExtractVdfValue(content, "LastUpdated");

                    if (string.IsNullOrWhiteSpace(appId) || string.IsNullOrWhiteSpace(name))
                        continue;

                    // Filter out common Steam runtimes / tools
                    if (appId == "228980" || appId == "250820" || appId == "8930" || appId == "1391110")
                        continue;

                    long? sizeOnDisk = long.TryParse(sizeStr, out var sz) ? sz : null;
                    DateTime? lastUpdated = long.TryParse(updatedStr, out var lu)
                        ? DateTimeOffset.FromUnixTimeSeconds(lu).UtcDateTime
                        : null;

                    string? installPath = null;
                    if (!string.IsNullOrEmpty(installdir))
                    {
                        var candidate = Path.Combine(steamappsDir, "common", installdir);
                        if (Directory.Exists(candidate))
                        {
                            installPath = candidate;
                        }
                    }

                    string? exePath = null;
                    string? exeName = null;
                    if (installPath != null && Directory.Exists(installPath))
                    {
                        exePath = FindPrimaryExecutable(installPath, installdir);
                        if (exePath != null)
                        {
                            exeName = Path.GetFileName(exePath);
                        }
                    }

                    // Check Steam local icon
                    string? iconUrl = null;
                    var localIcon = Path.Combine(steamPath, "steam", "games", $"{appId}.ico");
                    if (File.Exists(localIcon))
                    {
                        iconUrl = GameIconExtractor.ExtractIconAsDataUrl(localIcon, $"steam_{appId}");
                    }
                    else if (!string.IsNullOrEmpty(exePath))
                    {
                        iconUrl = GameIconExtractor.ExtractIconAsDataUrl(exePath, $"steam_{appId}");
                    }

                    var bannerUrl = $"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appId}/header.jpg";

                    games.Add(new InstalledGame
                    {
                        Id = $"steam_{appId}",
                        Title = name,
                        Platform = GamePlatform.Steam,
                        LaunchUri = $"steam://rungameid/{appId}",
                        InstallPath = installPath,
                        ExecutablePath = exePath,
                        ExecutableName = exeName,
                        IconUrl = iconUrl,
                        BannerUrl = bannerUrl,
                        IsCustom = false,
                        SizeOnDisk = sizeOnDisk,
                        LastUpdated = lastUpdated
                    });
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"Failed to parse ACF {acf}: {ex.Message}");
                }
            }
        }

        return games;
    }

    private static string? ExtractVdfValue(string content, string key)
    {
        var match = Regex.Match(content, $@"""{Regex.Escape(key)}""\s+""([^""]*)""", RegexOptions.IgnoreCase);
        return match.Success ? match.Groups[1].Value : null;
    }

    #endregion

    #region 2. Epic Games Scanner

    public static List<InstalledGame> ScanEpic()
    {
        var games = new List<InstalledGame>();

        var commonAppData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
        var manifestsDir = Path.Combine(commonAppData, "Epic", "EpicGamesLauncher", "Data", "Manifests");

        if (!Directory.Exists(manifestsDir))
        {
            try
            {
                using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Epic Games\EpicGamesLauncher")
                             ?? Registry.LocalMachine.OpenSubKey(@"SOFTWARE\WOW6432Node\Epic Games\EpicGamesLauncher");
                var appDataPath = key?.GetValue("AppDataPath") as string;
                if (!string.IsNullOrEmpty(appDataPath))
                {
                    var cand = Path.Combine(appDataPath, "Manifests");
                    if (Directory.Exists(cand))
                        manifestsDir = cand;
                }
            }
            catch { }
        }

        if (!Directory.Exists(manifestsDir))
            return games;

        string[] itemFiles;
        try
        {
            itemFiles = Directory.GetFiles(manifestsDir, "*.item");
        }
        catch
        {
            return games;
        }

        foreach (var itemFile in itemFiles)
        {
            try
            {
                var json = File.ReadAllText(itemFile);
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                var appName = root.TryGetProperty("AppName", out var an) ? an.GetString() : null;
                var displayName = root.TryGetProperty("DisplayName", out var dn) ? dn.GetString() : null;
                var installLocation = root.TryGetProperty("InstallLocation", out var il) ? il.GetString() : null;
                var launchExecutable = root.TryGetProperty("LaunchExecutable", out var le) ? le.GetString() : null;
                var mainGameAppName = root.TryGetProperty("MainGameAppName", out var mg) ? mg.GetString() : null;
                var isApp = !root.TryGetProperty("bIsApplication", out var ia) || ia.GetBoolean();
                var installSize = root.TryGetProperty("InstallSize", out var isz) ? isz.GetInt64() : (long?)null;

                if (string.IsNullOrWhiteSpace(appName) || string.IsNullOrWhiteSpace(displayName))
                    continue;

                // Skip non-applications or standalone DLC entries
                if (!isApp) continue;
                if (!string.IsNullOrEmpty(mainGameAppName) && !string.Equals(appName, mainGameAppName, StringComparison.OrdinalIgnoreCase))
                    continue;

                string? fullExePath = null;
                if (!string.IsNullOrEmpty(installLocation) && !string.IsNullOrEmpty(launchExecutable))
                {
                    fullExePath = Path.IsPathRooted(launchExecutable)
                        ? launchExecutable
                        : Path.Combine(installLocation, launchExecutable);
                }

                string? iconUrl = null;
                if (!string.IsNullOrEmpty(fullExePath) && File.Exists(fullExePath))
                {
                    iconUrl = GameIconExtractor.ExtractIconAsDataUrl(fullExePath, $"epic_{appName}");
                }

                games.Add(new InstalledGame
                {
                    Id = $"epic_{appName}",
                    Title = displayName,
                    Platform = GamePlatform.Epic,
                    LaunchUri = $"com.epicgames.launcher://apps/{appName}?action=launch&silent=true",
                    InstallPath = installLocation,
                    ExecutablePath = fullExePath,
                    ExecutableName = !string.IsNullOrEmpty(fullExePath) ? Path.GetFileName(fullExePath) : null,
                    IconUrl = iconUrl,
                    IsCustom = false,
                    SizeOnDisk = installSize
                });
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Failed to parse Epic item {itemFile}: {ex.Message}");
            }
        }

        return games;
    }

    #endregion

    #region 3. EA App Scanner

    public static List<InstalledGame> ScanEA()
    {
        var games = new List<InstalledGame>();
        var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var eaCoreKeys = new[]
        {
            @"SOFTWARE\Electronic Arts\EA Core\Installed Games",
            @"SOFTWARE\WOW6432Node\Electronic Arts\EA Core\Installed Games"
        };

        foreach (var regPath in eaCoreKeys)
        {
            try
            {
                using var baseKey = Registry.LocalMachine.OpenSubKey(regPath);
                if (baseKey == null) continue;

                foreach (var subKeyName in baseKey.GetSubKeyNames())
                {
                    if (!seenKeys.Add(subKeyName)) continue;

                    using var subKey = baseKey.OpenSubKey(subKeyName);
                    if (subKey == null) continue;

                    var installDir = subKey.GetValue("Install Dir") as string
                                  ?? subKey.GetValue("InstallDir") as string;
                    var executable = subKey.GetValue("Executable") as string;
                    var title = subKey.GetValue("Title") as string
                             ?? subKey.GetValue("DisplayName") as string
                             ?? subKeyName;

                    if (string.IsNullOrEmpty(installDir) || !Directory.Exists(installDir))
                        continue;

                    string? fullExe = null;
                    if (!string.IsNullOrEmpty(executable))
                    {
                        fullExe = Path.IsPathRooted(executable) ? executable : Path.Combine(installDir, executable);
                    }
                    else
                    {
                        fullExe = FindPrimaryExecutable(installDir, title);
                    }

                    string? iconUrl = null;
                    if (!string.IsNullOrEmpty(fullExe) && File.Exists(fullExe))
                    {
                        iconUrl = GameIconExtractor.ExtractIconAsDataUrl(fullExe, $"ea_{subKeyName}");
                    }

                    games.Add(new InstalledGame
                    {
                        Id = $"ea_{SanitizeId(subKeyName)}",
                        Title = title,
                        Platform = GamePlatform.EA,
                        LaunchUri = $"origin2://game/launch?offerIds={subKeyName}",
                        InstallPath = installDir,
                        ExecutablePath = fullExe,
                        ExecutableName = !string.IsNullOrEmpty(fullExe) ? Path.GetFileName(fullExe) : null,
                        IconUrl = iconUrl,
                        IsCustom = false
                    });
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"EA Core scan error in {regPath}: {ex.Message}");
            }
        }

        // Uninstall Registry fallback for EA games
        var uninstallPaths = new[]
        {
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
        };

        foreach (var regPath in uninstallPaths)
        {
            try
            {
                using var baseKey = Registry.LocalMachine.OpenSubKey(regPath);
                if (baseKey == null) continue;

                foreach (var subKeyName in baseKey.GetSubKeyNames())
                {
                    using var subKey = baseKey.OpenSubKey(subKeyName);
                    if (subKey == null) continue;

                    var publisher = subKey.GetValue("Publisher") as string ?? "";
                    var eaId = subKey.GetValue("EAInstallerID") as string;

                    if (publisher.IndexOf("Electronic Arts", StringComparison.OrdinalIgnoreCase) < 0 && string.IsNullOrEmpty(eaId))
                        continue;

                    var displayName = subKey.GetValue("DisplayName") as string;
                    var installLocation = subKey.GetValue("InstallLocation") as string;
                    var displayIcon = subKey.GetValue("DisplayIcon") as string;

                    if (string.IsNullOrWhiteSpace(displayName) || string.IsNullOrEmpty(installLocation) || !Directory.Exists(installLocation))
                        continue;

                    if (displayName.IndexOf("EA Desktop", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        displayName.IndexOf("EA app", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        displayName.IndexOf("Origin", StringComparison.OrdinalIgnoreCase) >= 0)
                        continue;

                    var gameKey = !string.IsNullOrEmpty(eaId) ? eaId : subKeyName;
                    if (!seenKeys.Add(gameKey)) continue;

                    string? exePath = null;
                    if (!string.IsNullOrEmpty(displayIcon) && displayIcon.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) && File.Exists(displayIcon))
                    {
                        exePath = displayIcon;
                    }
                    else
                    {
                        exePath = FindPrimaryExecutable(installLocation, displayName);
                    }

                    string? iconUrl = null;
                    if (!string.IsNullOrEmpty(exePath) && File.Exists(exePath))
                    {
                        iconUrl = GameIconExtractor.ExtractIconAsDataUrl(exePath, $"ea_{gameKey}");
                    }

                    games.Add(new InstalledGame
                    {
                        Id = $"ea_{SanitizeId(gameKey)}",
                        Title = displayName,
                        Platform = GamePlatform.EA,
                        LaunchUri = $"origin2://game/launch?offerIds={gameKey}",
                        InstallPath = installLocation,
                        ExecutablePath = exePath,
                        ExecutableName = !string.IsNullOrEmpty(exePath) ? Path.GetFileName(exePath) : null,
                        IconUrl = iconUrl,
                        IsCustom = false
                    });
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"EA Uninstall scan error: {ex.Message}");
            }
        }

        return games;
    }

    #endregion

    #region 4. Xbox / Microsoft Store / PC Game Pass Scanner

    public static List<InstalledGame> ScanXbox()
    {
        var games = new List<InstalledGame>();
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Scan fixed drives for .GamingRoot and XboxGames
        try
        {
            var drives = DriveInfo.GetDrives().Where(d => d.DriveType == DriveType.Fixed && d.IsReady);
            foreach (var drive in drives)
            {
                var xboxGamesDir = Path.Combine(drive.RootDirectory.FullName, "XboxGames");
                if (!Directory.Exists(xboxGamesDir)) continue;

                string[] gameDirs;
                try
                {
                    gameDirs = Directory.GetDirectories(xboxGamesDir);
                }
                catch
                {
                    continue;
                }

                foreach (var gDir in gameDirs)
                {
                    try
                    {
                        var dirName = Path.GetFileName(gDir);
                        if (string.IsNullOrWhiteSpace(dirName)) continue;

                        var id = $"xbox_{SanitizeId(dirName)}";
                        if (!seenIds.Add(id)) continue;

                        var exePath = FindPrimaryExecutable(gDir, dirName);
                        string? iconUrl = null;
                        if (!string.IsNullOrEmpty(exePath) && File.Exists(exePath))
                        {
                            iconUrl = GameIconExtractor.ExtractIconAsDataUrl(exePath, id);
                        }

                        games.Add(new InstalledGame
                        {
                            Id = id,
                            Title = dirName,
                            Platform = GamePlatform.Xbox,
                            InstallPath = gDir,
                            ExecutablePath = exePath,
                            ExecutableName = !string.IsNullOrEmpty(exePath) ? Path.GetFileName(exePath) : null,
                            IconUrl = iconUrl,
                            IsCustom = false
                        });
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"Error scanning Xbox folder {gDir}: {ex.Message}");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Xbox drive scan error: {ex.Message}");
        }

        // AppModel Repository registry scan
        try
        {
            using var repoKey = Registry.CurrentUser.OpenSubKey(@"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\Repository\Packages");
            if (repoKey != null)
            {
                foreach (var pkg in repoKey.GetSubKeyNames())
                {
                    if (pkg.IndexOf("Microsoft.Xbox", StringComparison.OrdinalIgnoreCase) < 0 &&
                        pkg.IndexOf("Bethesda", StringComparison.OrdinalIgnoreCase) < 0 &&
                        pkg.IndexOf("Activision", StringComparison.OrdinalIgnoreCase) < 0 &&
                        pkg.IndexOf("Mojang", StringComparison.OrdinalIgnoreCase) < 0 &&
                        pkg.IndexOf("XboxGaming", StringComparison.OrdinalIgnoreCase) < 0)
                    {
                        continue;
                    }

                    var id = $"xbox_{SanitizeId(pkg)}";
                    if (!seenIds.Add(id)) continue;

                    using var pkgKey = repoKey.OpenSubKey(pkg);
                    var displayName = pkgKey?.GetValue("DisplayName") as string ?? pkg;

                    games.Add(new InstalledGame
                    {
                        Id = id,
                        Title = CleanPackageName(displayName),
                        Platform = GamePlatform.Xbox,
                        LaunchUri = $"shell:AppsFolder\\{pkg}!App",
                        IsCustom = false
                    });
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Xbox AppModel scan error: {ex.Message}");
        }

        return games;
    }

    private static string CleanPackageName(string name)
    {
        if (name.StartsWith("ms-resource:")) return "Xbox Game";
        var parts = name.Split('_');
        return parts.Length > 0 ? parts[0] : name;
    }

    #endregion

    #region 5. GOG Galaxy Scanner

    public static List<InstalledGame> ScanGOG()
    {
        var games = new List<InstalledGame>();
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var gogPaths = new[]
        {
            @"SOFTWARE\WOW6432Node\GOG.com\Games",
            @"SOFTWARE\GOG.com\Games"
        };

        foreach (var regPath in gogPaths)
        {
            try
            {
                using var baseKey = Registry.LocalMachine.OpenSubKey(regPath);
                if (baseKey == null) continue;

                foreach (var gameId in baseKey.GetSubKeyNames())
                {
                    if (!seenIds.Add(gameId)) continue;

                    using var subKey = baseKey.OpenSubKey(gameId);
                    if (subKey == null) continue;

                    var dependsOn = subKey.GetValue("dependsOn") as string;
                    if (!string.IsNullOrEmpty(dependsOn))
                        continue; // DLC entry

                    var gameName = subKey.GetValue("gameName") as string
                                ?? subKey.GetValue("GAMENAME") as string;
                    var path = subKey.GetValue("path") as string
                            ?? subKey.GetValue("PATH") as string;
                    var exe = subKey.GetValue("exe") as string
                           ?? subKey.GetValue("EXE") as string;
                    var iconPath = subKey.GetValue("icon") as string
                                ?? subKey.GetValue("ICON") as string;

                    if (string.IsNullOrWhiteSpace(gameName) || string.IsNullOrEmpty(path) || !Directory.Exists(path))
                        continue;

                    string? fullExe = null;
                    if (!string.IsNullOrEmpty(exe))
                    {
                        fullExe = Path.IsPathRooted(exe) ? exe : Path.Combine(path, exe);
                    }
                    else
                    {
                        fullExe = FindPrimaryExecutable(path, gameName);
                    }

                    string? iconUrl = null;
                    if (!string.IsNullOrEmpty(iconPath) && File.Exists(iconPath))
                    {
                        iconUrl = GameIconExtractor.ExtractIconAsDataUrl(iconPath, $"gog_{gameId}");
                    }
                    else if (!string.IsNullOrEmpty(fullExe) && File.Exists(fullExe))
                    {
                        iconUrl = GameIconExtractor.ExtractIconAsDataUrl(fullExe, $"gog_{gameId}");
                    }

                    games.Add(new InstalledGame
                    {
                        Id = $"gog_{gameId}",
                        Title = gameName,
                        Platform = GamePlatform.GOG,
                        LaunchUri = $"goggalaxy://launch/{gameId}",
                        InstallPath = path,
                        ExecutablePath = fullExe,
                        ExecutableName = !string.IsNullOrEmpty(fullExe) ? Path.GetFileName(fullExe) : null,
                        IconUrl = iconUrl,
                        IsCustom = false
                    });
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"GOG scan error in {regPath}: {ex.Message}");
            }
        }

        return games;
    }

    #endregion

    #region 6. Ubisoft Connect Scanner

    public static List<InstalledGame> ScanUbisoft()
    {
        var games = new List<InstalledGame>();
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Step 1: Map display names and icons from Uninstall registry
        var uninstallMap = new Dictionary<string, (string Name, string? Icon, string? InstallDir)>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var uninstKey = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall")
                               ?? Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
            if (uninstKey != null)
            {
                foreach (var sub in uninstKey.GetSubKeyNames())
                {
                    if (!sub.StartsWith("Uplay Install ", StringComparison.OrdinalIgnoreCase)) continue;

                    var uplayId = sub.Substring("Uplay Install ".Length).Trim();
                    using var k = uninstKey.OpenSubKey(sub);
                    if (k == null) continue;

                    var name = k.GetValue("DisplayName") as string;
                    var icon = k.GetValue("DisplayIcon") as string;
                    var loc = k.GetValue("InstallLocation") as string;

                    if (!string.IsNullOrEmpty(name))
                    {
                        uninstallMap[uplayId] = (name, icon, loc);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Ubisoft uninstall lookup error: {ex.Message}");
        }

        // Step 2: Scan Ubisoft Launcher Installs registry
        var ubiPaths = new[]
        {
            @"SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs",
            @"SOFTWARE\Ubisoft\Launcher\Installs"
        };

        foreach (var regPath in ubiPaths)
        {
            try
            {
                using var baseKey = Registry.LocalMachine.OpenSubKey(regPath);
                if (baseKey == null) continue;

                foreach (var gameId in baseKey.GetSubKeyNames())
                {
                    if (!seenIds.Add(gameId)) continue;

                    using var subKey = baseKey.OpenSubKey(gameId);
                    if (subKey == null) continue;

                    var installDir = subKey.GetValue("InstallDir") as string;
                    var exec = subKey.GetValue("Exec") as string;

                    if (string.IsNullOrEmpty(installDir) || !Directory.Exists(installDir))
                        continue;

                    string title = $"Ubisoft Game {gameId}";
                    string? iconPath = null;
                    if (uninstallMap.TryGetValue(gameId, out var meta))
                    {
                        title = meta.Name;
                        iconPath = meta.Icon;
                    }

                    string? fullExe = null;
                    if (!string.IsNullOrEmpty(exec))
                    {
                        fullExe = Path.IsPathRooted(exec) ? exec : Path.Combine(installDir, exec);
                    }
                    else
                    {
                        fullExe = FindPrimaryExecutable(installDir, title);
                    }

                    string? iconUrl = null;
                    if (!string.IsNullOrEmpty(iconPath) && File.Exists(iconPath))
                    {
                        iconUrl = GameIconExtractor.ExtractIconAsDataUrl(iconPath, $"ubisoft_{gameId}");
                    }
                    else if (!string.IsNullOrEmpty(fullExe) && File.Exists(fullExe))
                    {
                        iconUrl = GameIconExtractor.ExtractIconAsDataUrl(fullExe, $"ubisoft_{gameId}");
                    }

                    games.Add(new InstalledGame
                    {
                        Id = $"ubisoft_{gameId}",
                        Title = title,
                        Platform = GamePlatform.Ubisoft,
                        LaunchUri = $"uplay://launch/{gameId}/0",
                        InstallPath = installDir,
                        ExecutablePath = fullExe,
                        ExecutableName = !string.IsNullOrEmpty(fullExe) ? Path.GetFileName(fullExe) : null,
                        IconUrl = iconUrl,
                        IsCustom = false
                    });
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Ubisoft scan error in {regPath}: {ex.Message}");
            }
        }

        return games;
    }

    #endregion

    #region Helper Utilities

    private static string? FindPrimaryExecutable(string directoryPath, string? hintName)
    {
        try
        {
            if (!Directory.Exists(directoryPath)) return null;

            // Search root directory first (depth 1)
            var rootExes = Directory.GetFiles(directoryPath, "*.exe", SearchOption.TopDirectoryOnly)
                .Where(f => !ExcludedExecutableNames.Contains(Path.GetFileName(f)))
                .ToList();

            if (rootExes.Count == 1)
                return rootExes[0];

            if (!string.IsNullOrEmpty(hintName) && rootExes.Count > 1)
            {
                var cleanHint = SanitizeName(hintName);
                var exactMatch = rootExes.FirstOrDefault(f =>
                    string.Equals(Path.GetFileNameWithoutExtension(f), cleanHint, StringComparison.OrdinalIgnoreCase) ||
                    Path.GetFileNameWithoutExtension(f).IndexOf(cleanHint, StringComparison.OrdinalIgnoreCase) >= 0);

                if (exactMatch != null)
                    return exactMatch;
            }

            // Pick largest executable in root if available
            if (rootExes.Count > 0)
            {
                return rootExes.OrderByDescending(f => new FileInfo(f).Length).First();
            }

            // Look up to 2 subdirectories deep
            var subExes = Directory.GetFiles(directoryPath, "*.exe", SearchOption.AllDirectories)
                .Where(f => !ExcludedExecutableNames.Contains(Path.GetFileName(f)))
                .Take(20)
                .ToList();

            if (subExes.Count > 0)
            {
                return subExes.OrderByDescending(f => new FileInfo(f).Length).First();
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Executable search error in {directoryPath}: {ex.Message}");
        }

        return null;
    }

    private static string SanitizeId(string id)
    {
        return Regex.Replace(id, @"[^a-zA-Z0-9_\-]", "_");
    }

    private static string SanitizeName(string name)
    {
        return Regex.Replace(name, @"[^a-zA-Z0-9]", "");
    }

    #endregion
}
