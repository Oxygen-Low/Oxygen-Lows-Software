package com.oxygenlow.oxygen_lows_software

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import android.widget.Toast
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

class UpdateManager(private val context: Context) {

    companion object {
        private const val TAG = "UpdateManager"
        private const val GITHUB_API_URL = "https://api.github.com/repos/Oxygen-Low/Oxygen-Lows-Software/releases/latest"

        fun isNewerVersion(latestVersion: String, currentVersion: String): Boolean {
            return try {
                val cleanLatest = latestVersion.trim().removePrefix("v").removePrefix("V")
                val cleanCurrent = currentVersion.trim().removePrefix("v").removePrefix("V")

                val latestParts = cleanLatest.split(".", "-", "_").mapNotNull { it.toIntOrNull() }
                val currentParts = cleanCurrent.split(".", "-", "_").mapNotNull { it.toIntOrNull() }

                val maxLen = maxOf(latestParts.size, currentParts.size)
                for (i in 0 until maxLen) {
                    val l = latestParts.getOrElse(i) { 0 }
                    val c = currentParts.getOrElse(i) { 0 }
                    if (l > c) return true
                    if (l < c) return false
                }
                false
            } catch (e: Exception) {
                false
            }
        }
    }

    data class UpdateInfo(
        val hasUpdate: Boolean,
        val downloadUrl: String? = null,
        val version: String? = null
    )

    val currentVersion: String
        get() {
            return try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    context.packageManager.getPackageInfo(
                        context.packageName,
                        android.content.pm.PackageManager.PackageInfoFlags.of(0)
                    ).versionName ?: "1.0"
                } else {
                    @Suppress("DEPRECATION")
                    context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "1.0"
                }
            } catch (e: Exception) {
                "1.0"
            }
        }

    fun checkForUpdates(): UpdateInfo {
        var connection: HttpURLConnection? = null
        return try {
            val url = URL(GITHUB_API_URL)
            connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            connection.setRequestProperty("User-Agent", "OxygenLowsSoftware-Android/$currentVersion")
            connection.setRequestProperty("Accept", "application/vnd.github.v3+json")

            val responseCode = connection.responseCode
            if (responseCode != HttpURLConnection.HTTP_OK) {
                Log.w(TAG, "Update check returned HTTP $responseCode")
                return UpdateInfo(false)
            }

            val responseText = connection.inputStream.bufferedReader().use { it.readText() }
            val root = JSONObject(responseText)

            if (!root.has("tag_name")) return UpdateInfo(false)
            val tagName = root.optString("tag_name")
            val latestVersion = tagName.removePrefix("v").removePrefix("V")

            if (!isNewerVersion(latestVersion, currentVersion)) {
                return UpdateInfo(false, null, latestVersion)
            }

            val assets = root.optJSONArray("assets") ?: return UpdateInfo(false)
            for (i in 0 until assets.length()) {
                val asset = assets.optJSONObject(i) ?: continue
                val name = asset.optString("name", "")
                if (name.endsWith(".apk", ignoreCase = true)) {
                    val downloadUrl = asset.optString("browser_download_url", "")
                    if (downloadUrl.isNotEmpty()) {
                        return UpdateInfo(hasUpdate = true, downloadUrl = downloadUrl, version = latestVersion)
                    }
                }
            }

            UpdateInfo(false)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking for updates", e)
            UpdateInfo(false)
        } finally {
            connection?.disconnect()
        }
    }

    fun downloadAndInstall(
        activity: Activity,
        downloadUrl: String,
        progressCallback: ((Int) -> Unit)? = null
    ): Boolean {
        val updatesDir = File(context.cacheDir, "updates")
        if (!updatesDir.exists()) {
            updatesDir.mkdirs()
        }

        val apkFile = File(updatesDir, "OxygenLowsSoftware.apk")
        val tempFile = File(updatesDir, "OxygenLowsSoftware.apk.tmp")
        if (tempFile.exists()) {
            tempFile.delete()
        }

        var currentUrl = downloadUrl
        var redirects = 0
        var connection: HttpURLConnection? = null

        try {
            while (true) {
                val url = URL(currentUrl)
                connection = url.openConnection() as HttpURLConnection
                connection.connectTimeout = 15000
                connection.readTimeout = 30000
                connection.setRequestProperty("User-Agent", "OxygenLowsSoftware-Android/$currentVersion")
                connection.instanceFollowRedirects = true

                val status = connection.responseCode
                if (status == HttpURLConnection.HTTP_MOVED_TEMP ||
                    status == HttpURLConnection.HTTP_MOVED_PERM ||
                    status == HttpURLConnection.HTTP_SEE_OTHER ||
                    status == 307 ||
                    status == 308
                ) {
                    val newUrl = connection.getHeaderField("Location")
                    if (!newUrl.isNullOrEmpty() && redirects < 5) {
                        currentUrl = newUrl
                        redirects++
                        connection.disconnect()
                        continue
                    }
                }
                break
            }

            val totalBytes = connection?.contentLengthLong ?: -1L
            val canReportProgress = totalBytes > 0 && progressCallback != null

            connection?.inputStream?.use { input ->
                FileOutputStream(tempFile).use { output ->
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    var totalRead = 0L

                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        totalRead += bytesRead

                        if (canReportProgress) {
                            val progress = ((totalRead * 100) / totalBytes).toInt()
                            progressCallback?.invoke(progress)
                        }
                    }
                    output.flush()
                }
            }

            if (apkFile.exists()) {
                apkFile.delete()
            }
            if (!tempFile.renameTo(apkFile)) {
                tempFile.copyTo(apkFile, overwrite = true)
                tempFile.delete()
            }

            installApk(activity, apkFile)
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Error downloading update", e)
            if (tempFile.exists()) {
                tempFile.delete()
            }
            activity.runOnUiThread {
                Toast.makeText(activity, activity.getString(R.string.update_failed), Toast.LENGTH_SHORT).show()
            }
            return false
        } finally {
            connection?.disconnect()
        }
    }

    private fun installApk(activity: Activity, apkFile: File) {
        activity.runOnUiThread {
            try {
                val contentUri: Uri = FileProvider.getUriForFile(
                    activity,
                    "${activity.packageName}.fileprovider",
                    apkFile
                )

                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(contentUri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }

                activity.startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Error starting APK installation intent", e)
                Toast.makeText(activity, activity.getString(R.string.update_failed), Toast.LENGTH_SHORT).show()
            }
        }
    }
}
