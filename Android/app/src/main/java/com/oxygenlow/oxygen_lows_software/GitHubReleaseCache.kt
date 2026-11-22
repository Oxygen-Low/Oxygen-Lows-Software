package com.oxygenlow.oxygen_lows_software

import android.content.Context
import java.net.HttpURLConnection
import java.net.URL

/**
 * Shared, on-disk cache for GitHub release API responses.
 *
 * Unauthenticated GitHub API calls are limited to 60 requests/hour per IP.
 * App updates, llama.cpp updates and installs all read the same release, so
 * responses are cached for an hour and revalidated with ETag. When GitHub
 * reports rate limiting, stale cached data is served instead of failing.
 */
object GitHubReleaseCache {
    private const val PREFS = "github_release_cache"
    private const val MAX_AGE_MS = 60L * 60 * 1000L

    fun get(context: Context, url: String, force: Boolean = false): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val cachedJson = prefs.getString("json:$url", null)
        val cachedEtag = prefs.getString("etag:$url", null)
        val fetchedAt = prefs.getLong("time:$url", 0L)
        if (!force && cachedJson != null && System.currentTimeMillis() - fetchedAt < MAX_AGE_MS) {
            return cachedJson
        }

        var connection: HttpURLConnection? = null
        try {
            connection = URL(url).openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 10000
            connection.readTimeout = 15000
            connection.setRequestProperty("User-Agent", "OxygenLowsSoftware")
            connection.setRequestProperty("Accept", "application/vnd.github+json")
            if (!cachedEtag.isNullOrBlank()) {
                connection.setRequestProperty("If-None-Match", cachedEtag)
            }

            val code = connection.responseCode
            when (code) {
                HttpURLConnection.HTTP_NOT_MODIFIED -> {
                    if (cachedJson != null) {
                        prefs.edit().putLong("time:$url", System.currentTimeMillis()).apply()
                        return cachedJson
                    }
                }
                403, 429 -> {
                    if (cachedJson != null) return cachedJson
                    throw IllegalStateException("GitHub API rate limit reached. Please try again later.")
                }
                HttpURLConnection.HTTP_OK -> {
                    val text = connection.inputStream.bufferedReader().use { it.readText() }
                    prefs.edit()
                        .putString("json:$url", text)
                        .putString("etag:$url", connection.getHeaderField("ETag") ?: "")
                        .putLong("time:$url", System.currentTimeMillis())
                        .apply()
                    return text
                }
            }
            if (cachedJson != null) return cachedJson
            throw IllegalStateException("GitHub API request failed (HTTP $code)")
        } finally {
            connection?.disconnect()
        }
    }
}
