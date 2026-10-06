package com.oxygenlow.oxygen_lows_software

import org.junit.Assert.*
import org.junit.Test

class NativeSecurityTest {
    @Test fun trustedOriginsOnly() {
        assertTrue(NativeSecurity.isTrustedOrigin("https://oxygenlow.com/path"))
        assertTrue(NativeSecurity.isTrustedOrigin("https://www.oxygenlow.com:443/"))
        for (url in listOf("http://oxygenlow.com", "https://oxygenlow.com:444", "https://oxygenlow.com.evil.example", "https://oxygenlow.com@evil.example", "file:///tmp/test", "data:text/html,test", "https://evil.example")) {
            assertFalse(url, NativeSecurity.isTrustedOrigin(url))
        }
    }
    @Test fun updatesOnlyFromOfficialRelease() {
        assertTrue(NativeSecurity.isReleaseUrl("https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/download/v1/app.apk"))
        for (url in listOf("https://github.com/attacker/repo/releases/download/v1/app.apk", "http://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/download/v1/app.apk", "https://evil.example/app.apk", "file:///tmp/app.apk")) {
            assertFalse(url, NativeSecurity.isDownloadUrl(url))
        }
    }
    @Test fun externalBrowserCannotLaunchLocalSchemes() {
        assertFalse(NativeSecurity.isWebUrl("intent://payload"))
        assertFalse(NativeSecurity.isWebUrl("file:///tmp/test"))
        assertTrue(NativeSecurity.isWebUrl("https://example.com"))
    }
}
