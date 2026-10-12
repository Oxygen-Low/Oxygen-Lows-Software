using DesktopApp;

static void Check(bool value) { if (!value) throw new Exception("Security regression"); }
Check(NativeSecurity.IsTrustedOrigin("https://oxygenlow.com/path"));
Check(NativeSecurity.IsTrustedOrigin("https://www.oxygenlow.com:443/"));
foreach (var url in new[] { "https://oxygenlow.com.evil.example/", "https://oxygenlow.com@evil.example/", "http://oxygenlow.com/", "https://oxygenlow.com:444/", "file:///tmp/test", "data:text/html,test", "https://evil.example/" })
    Check(!NativeSecurity.IsTrustedOrigin(url));
Check(!NativeSecurity.IsWebUrl("file:///C:/Windows/system32/cmd.exe"));
Check(!NativeSecurity.IsWebUrl("powershell:payload"));
Check(UpdateManager.IsReleaseUrl("https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/download/v1/app.exe"));
foreach (var url in new[] { "http://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/download/v1/app.exe", "https://github.com/attacker/repo/releases/download/v1/app.exe", "https://evil.example/app.exe", "https://github.com:444/Oxygen-Low/Oxygen-Lows-Software/releases/download/v1/app.exe" })
    Check(!UpdateManager.IsDownloadUrl(url));
Console.WriteLine("Native origin and release destination security checks passed.");
