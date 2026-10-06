package com.oxygenlow.oxygen_lows_software

import java.net.URI

object NativeSecurity {
    val trustedOrigins = setOf("https://oxygenlow.com", "https://www.oxygenlow.com")

    fun isTrustedOrigin(value: String?): Boolean = try {
        val uri = URI(value ?: "")
        uri.scheme.equals("https", true) && uri.rawUserInfo == null &&
            (uri.port == -1 || uri.port == 443) &&
            (uri.host.equals("oxygenlow.com", true) || uri.host.equals("www.oxygenlow.com", true)) &&
            !(uri.path ?: "").startsWith("/api/", true)
    } catch (_: Exception) { false }

    fun isReleaseUrl(value: String): Boolean = try {
        val uri = URI(value)
        uri.scheme == "https" && (uri.port == -1 || uri.port == 443) && uri.rawUserInfo == null &&
            uri.host == "github.com" && uri.rawPath.startsWith("/Oxygen-Low/Oxygen-Lows-Software/releases/download/")
    } catch (_: Exception) { false }

    fun isDownloadUrl(value: String): Boolean = try {
        val uri = URI(value)
        isReleaseUrl(value) || (uri.scheme == "https" && (uri.port == -1 || uri.port == 443) &&
            uri.rawUserInfo == null && uri.host in setOf("release-assets.githubusercontent.com", "objects.githubusercontent.com"))
    } catch (_: Exception) { false }

    fun isWebUrl(value: String?): Boolean = try {
        val uri = URI(value ?: "")
        (uri.scheme.equals("https", true) || uri.scheme.equals("http", true)) &&
            !uri.host.isNullOrEmpty() && uri.rawUserInfo == null
    } catch (_: Exception) { false }
}
