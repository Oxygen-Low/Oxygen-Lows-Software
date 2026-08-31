using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace DesktopApp.Models;

public static class GamePlatform
{
    public const string Steam = "steam";
    public const string Epic = "epic";
    public const string EA = "ea";
    public const string Xbox = "xbox";
    public const string GOG = "gog";
    public const string Ubisoft = "ubisoft";
    public const string Custom = "custom";
}

public class InstalledGame
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("platform")]
    public string Platform { get; set; } = string.Empty;

    [JsonPropertyName("launchUri")]
    public string? LaunchUri { get; set; }

    [JsonPropertyName("executablePath")]
    public string? ExecutablePath { get; set; }

    [JsonPropertyName("installPath")]
    public string? InstallPath { get; set; }

    [JsonPropertyName("iconUrl")]
    public string? IconUrl { get; set; }

    [JsonPropertyName("bannerUrl")]
    public string? BannerUrl { get; set; }

    [JsonPropertyName("isCustom")]
    public bool IsCustom { get; set; }

    [JsonPropertyName("executableName")]
    public string? ExecutableName { get; set; }

    [JsonPropertyName("sizeOnDisk")]
    public long? SizeOnDisk { get; set; }

    [JsonPropertyName("lastUpdated")]
    public DateTime? LastUpdated { get; set; }
}

public class RunningGameSession
{
    [JsonPropertyName("gameId")]
    public string GameId { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("platform")]
    public string Platform { get; set; } = string.Empty;

    [JsonPropertyName("processId")]
    public int ProcessId { get; set; }

    [JsonPropertyName("processName")]
    public string ProcessName { get; set; } = string.Empty;

    [JsonPropertyName("startedAt")]
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("lastTickAt")]
    public DateTime LastTickAt { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("elapsedSeconds")]
    public double ElapsedSeconds { get; set; }

    [JsonPropertyName("totalSessionSeconds")]
    public double TotalSessionSeconds { get; set; }
}

public class LaunchGameRequest
{
    [JsonPropertyName("gameId")]
    public string GameId { get; set; } = string.Empty;

    [JsonPropertyName("platform")]
    public string Platform { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("launchUri")]
    public string? LaunchUri { get; set; }

    [JsonPropertyName("executablePath")]
    public string? ExecutablePath { get; set; }

    [JsonPropertyName("arguments")]
    public string? Arguments { get; set; }

    [JsonPropertyName("workingDirectory")]
    public string? WorkingDirectory { get; set; }

    [JsonPropertyName("executableName")]
    public string? ExecutableName { get; set; }
}

public class LaunchGameResult
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("processId")]
    public int? ProcessId { get; set; }
}

public class PickGameResult
{
    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("executablePath")]
    public string ExecutablePath { get; set; } = string.Empty;

    [JsonPropertyName("iconDataUrl")]
    public string? IconDataUrl { get; set; }
}

public class GameScanResult
{
    [JsonPropertyName("games")]
    public List<InstalledGame> Games { get; set; } = new();

    [JsonPropertyName("scannedAt")]
    public DateTime ScannedAt { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("platformsScanned")]
    public List<string> PlatformsScanned { get; set; } = new();
}
