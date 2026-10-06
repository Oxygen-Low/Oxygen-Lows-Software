using System;

namespace DesktopApp;

public static class NativeSecurity
{
    public static bool IsWebUrl(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        (uri.Scheme == "https" || uri.Scheme == "http") &&
        string.IsNullOrEmpty(uri.UserInfo);

    public static bool IsTrustedOrigin(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        uri.Scheme == "https" && uri.Port == 443 && string.IsNullOrEmpty(uri.UserInfo) &&
        (uri.Host == "oxygenlow.com" || uri.Host == "www.oxygenlow.com") &&
        !uri.AbsolutePath.StartsWith("/api/", StringComparison.OrdinalIgnoreCase);
}
