package com.oxygenlow.oxygen_lows_software

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.WebResourceRequest
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AlertDialog
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import org.json.JSONObject
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var webAppInterface: WebAppInterface
    private var isForeground = false
    private var isUpdateInProgress = false
    private val updateHandler = Handler(Looper.getMainLooper())
    private val updateCheckRunnable = object : Runnable {
        override fun run() {
            if (!isForeground) return
            performUpdateCheck()
            updateHandler.postDelayed(this, 30_000L)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Fit system windows to avoid underlapping status bar
        WindowCompat.setDecorFitsSystemWindows(window, true)

        webView = WebView(this)
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        
        webAppInterface = WebAppInterface(this, webView)
        // The legacy JavascriptInterface cannot identify the calling frame/origin.
        // Older WebViews retain web functionality without privileged commands.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "AndroidApp", NativeSecurity.trustedOrigins) {
                    _, message, sourceOrigin, isMainFrame, _ ->
                if (isMainFrame && NativeSecurity.isTrustedOrigin(sourceOrigin.toString()) &&
                    NativeSecurity.isTrustedOrigin(webView.url)) {
                    message.data?.let { webAppInterface.postMessage(it) }
                }
            }
        } else {
            showWebViewUpdatePrompt()
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val target = request?.url?.toString() ?: return true
                if (NativeSecurity.isTrustedOrigin(target)) return false
                if (request.isForMainFrame && NativeSecurity.isWebUrl(target)) {
                    try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(target))) } catch (_: Exception) { }
                }
                return true
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (NativeSecurity.isTrustedOrigin(url)) injectPolyfill()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: android.webkit.PermissionRequest?) {
                if (request == null) return
                val origin = request.origin?.toString() ?: ""
                if (NativeSecurity.isTrustedOrigin(origin)) {
                    request.grant(request.resources)
                } else {
                    request.deny()
                }
            }
        }

        if (androidx.core.content.ContextCompat.checkSelfPermission(
                this,
                android.Manifest.permission.RECORD_AUDIO
            ) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            androidx.core.app.ActivityCompat.requestPermissions(
                this,
                arrayOf(android.Manifest.permission.RECORD_AUDIO),
                1002
            )
        }

        if (intent?.data?.scheme == "oxygenlows") {
            handleIntent(intent)
        } else {
            webView.loadUrl("https://oxygenlow.com/?android=1")
        }
    }

    override fun onResume() {
        super.onResume()
        isForeground = true
        updateHandler.removeCallbacks(updateCheckRunnable)
        updateHandler.post(updateCheckRunnable)
    }

    override fun onPause() {
        super.onPause()
        isForeground = false
        updateHandler.removeCallbacks(updateCheckRunnable)
    }

    override fun onDestroy() {
        isForeground = false
        updateHandler.removeCallbacks(updateCheckRunnable)
        super.onDestroy()
    }

    private fun performUpdateCheck() {
        if (isUpdateInProgress) return
        Thread {
            if (!isForeground || isUpdateInProgress) return@Thread
            isUpdateInProgress = true
            try {
                val updateManager = UpdateManager(this)
                val updateInfo = updateManager.checkForUpdates()
                if (isForeground && updateInfo.hasUpdate && !updateInfo.downloadUrl.isNullOrBlank()) {
                    runOnUiThread {
                        if (isForeground && !isFinishing && !isDestroyed) {
                            val versionStr = updateInfo.version ?: ""
                            Toast.makeText(
                                this,
                                getString(R.string.update_downloading, versionStr),
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    }
                    updateManager.downloadAndInstall(this, updateInfo.downloadUrl)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                isUpdateInProgress = false
            }
        }.start()
    }

    private fun showWebViewUpdatePrompt() {
        AlertDialog.Builder(this)
            .setTitle(R.string.webview_update_title)
            .setMessage(R.string.webview_update_message)
            .setPositiveButton(R.string.webview_update_action) { _, _ -> openWebViewUpdate() }
            .setNegativeButton(R.string.webview_update_later, null)
            .show()
    }

    private fun openWebViewUpdate() {
        // Some devices use Chrome or another package as their WebView provider.
        val providerPackage = WebViewCompat.getCurrentWebViewPackage(this)?.packageName
            ?: "com.google.android.webview"
        val storeUri = Uri.parse("market://details").buildUpon()
            .appendQueryParameter("id", providerPackage).build()
        try {
            startActivity(Intent(Intent.ACTION_VIEW, storeUri).setPackage("com.android.vending"))
        } catch (_: ActivityNotFoundException) {
            val webUri = Uri.parse("https://play.google.com/store/apps/details").buildUpon()
                .appendQueryParameter("id", providerPackage).build()
            try {
                startActivity(Intent(Intent.ACTION_VIEW, webUri))
            } catch (_: ActivityNotFoundException) {
                Toast.makeText(this, R.string.webview_update_unavailable, Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        intent?.data?.let { uri ->
            if (uri.scheme == "oxygenlows") {
                val urlString = "https://oxygenlow.com/auth/callback" +
                    (uri.encodedQuery?.let { "?$it" } ?: "") +
                    (uri.encodedFragment?.let { "#$it" } ?: "")
                webView.loadUrl(Uri.parse(urlString).buildUpon().appendQueryParameter("android", "1").build().toString())
            }
        }
    }

    private fun checkForUpdatesOnStartup() {
        Thread {
            try {
                val updateManager = UpdateManager(this)
                val updateInfo = updateManager.checkForUpdates()
                if (updateInfo.hasUpdate && !updateInfo.downloadUrl.isNullOrBlank()) {
                    runOnUiThread {
                        val versionStr = updateInfo.version ?: ""
                        Toast.makeText(
                            this,
                            getString(R.string.update_downloading, versionStr),
                            Toast.LENGTH_LONG
                        ).show()
                    }
                    updateManager.downloadAndInstall(this, updateInfo.downloadUrl)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }.start()
    }

    private fun injectPolyfill() {
        if (!NativeSecurity.isTrustedOrigin(webView.url)) return
        val js = """
            if (window.top !== window || !window.AndroidApp) { /* no native bridge */ }
            else {
            if (!window.chrome) {
                window.chrome = {};
            }
            if (!window.chrome.webview) {
                window.chrome.webview = {
                    postMessage: function(message) {
                        window.AndroidApp.postMessage(message);
                    },
                    addEventListener: function(type, listener) {
                        if (type === 'message') {
                            if (!window.androidMessageListeners) window.androidMessageListeners = [];
                            window.androidMessageListeners.push(listener);
                        }
                    },
                    removeEventListener: function(type, listener) {
                        if (type === 'message' && window.androidMessageListeners) {
                            window.androidMessageListeners = window.androidMessageListeners.filter(l => l !== listener);
                        }
                    }
                };
                
                // Expose function for Android to call back
                window.dispatchAndroidMessage = function(dataStr) {
                    if (window.androidMessageListeners) {
                        window.androidMessageListeners.forEach(listener => {
                            listener({ data: dataStr });
                        });
                    }
                };
            }
            }
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }
}

class WebAppInterface(private val context: Activity, private val webView: WebView) {

    private var activeRingtone: Ringtone? = null

    fun postMessage(message: String) {
        try {
            val json = JSONObject(message)
            val command = json.optString("command")
            val id = json.optString("id")

            when (command) {
                "play_ringtone" -> {
                    try {
                        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                        activeRingtone?.stop()
                        activeRingtone = RingtoneManager.getRingtone(context, uri)
                        activeRingtone?.play()
                        val response = JSONObject().apply {
                            put("id", id)
                            put("success", true)
                        }
                        sendResponse(response.toString())
                    } catch (e: Exception) {
                        val response = JSONObject().apply {
                            put("id", id)
                            put("success", false)
                            put("error", e.message)
                        }
                        sendResponse(response.toString())
                    }
                }
                "stop_ringtone" -> {
                    try {
                        activeRingtone?.stop()
                        activeRingtone = null
                        val response = JSONObject().apply {
                            put("id", id)
                            put("success", true)
                        }
                        sendResponse(response.toString())
                    } catch (e: Exception) {
                        val response = JSONObject().apply {
                            put("id", id)
                            put("success", false)
                            put("error", e.message)
                        }
                        sendResponse(response.toString())
                    }
                }
                "require_admin" -> {
                    // Always true on Android wrapper to bypass Windows block
                    val response = JSONObject().apply {
                        put("id", id)
                        put("success", true)
                        put("data", JSONObject().apply { put("isAdmin", true) })
                    }
                    sendResponse(response.toString())
                }
                "android_vpn_connect" -> {
                    val configStr = json.optString("config")
                    val type = json.optString("type")
                    val configName = json.optString("name", "oxygenlow_vpn")
                    
                    try {
                        connectVpn(configStr, type, configName)
                        val response = JSONObject().apply {
                            put("id", id)
                            put("success", true)
                        }
                        sendResponse(response.toString())
                    } catch (e: Exception) {
                        val response = JSONObject().apply {
                            put("id", id)
                            put("success", false)
                            put("error", e.message)
                        }
                        sendResponse(response.toString())
                    }
                }
                "open_browser" -> {
                    val url = json.optString("url")
                    require(NativeSecurity.isWebUrl(url)) { "Invalid browser URL" }
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    context.startActivity(intent)
                    val response = JSONObject().apply {
                        put("id", id)
                        put("success", true)
                    }
                    sendResponse(response.toString())
                }
                "get_location" -> {
                    // Fallback to IP based on android for now to mirror desktop's web call if not requested natively
                    val response = JSONObject().apply {
                        put("id", id)
                        put("success", false)
                        put("error", "Use web fallback") // The web app falls back nicely if this throws exception usually, but let's check VPN.tsx
                    }
                    sendResponse(response.toString())
                }
                "check_for_updates" -> {
                    Thread {
                        try {
                            val updateManager = UpdateManager(context)
                            val updateInfo = updateManager.checkForUpdates()
                            val response = JSONObject().apply {
                                put("id", id)
                                put("success", true)
                                put("data", JSONObject().apply {
                                    put("hasUpdate", updateInfo.hasUpdate)
                                    put("version", updateInfo.version ?: "")
                                    put("downloadUrl", updateInfo.downloadUrl ?: "")
                                    put("currentVersion", updateManager.currentVersion)
                                })
                            }
                            sendResponse(response.toString())
                        } catch (e: Exception) {
                            val response = JSONObject().apply {
                                put("id", id)
                                put("success", false)
                                put("error", e.message)
                            }
                            sendResponse(response.toString())
                        }
                    }.start()
                }
                "install_update" -> {
                    val downloadUrl = json.optString("downloadUrl")
                    if (downloadUrl.isNotBlank()) {
                        Thread {
                            try {
                                val updateManager = UpdateManager(context)
                                val success = updateManager.downloadAndInstall(context, downloadUrl)
                                val response = JSONObject().apply {
                                    put("id", id)
                                    put("success", success)
                                }
                                sendResponse(response.toString())
                            } catch (e: Exception) {
                                val response = JSONObject().apply {
                                    put("id", id)
                                    put("success", false)
                                    put("error", e.message)
                                }
                                sendResponse(response.toString())
                            }
                        }.start()
                    } else {
                        val response = JSONObject().apply {
                            put("id", id)
                            put("success", false)
                            put("error", "Missing downloadUrl")
                        }
                        sendResponse(response.toString())
                    }
                }
                // Fallback for unhandled commands
                else -> {
                    val response = JSONObject().apply {
                        put("id", id)
                        put("success", false)
                        put("error", "Command not supported on Android: ${'$'}command")
                    }
                    sendResponse(response.toString())
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun connectVpn(configStr: String, type: String, name: String) {
        val ext = if (type.contains("WireGuard", true)) "conf" else "ovpn"
        val sanitizedBaseName = File(name).name
            .replace(Regex("[^a-zA-Z0-9_-]"), "_")
            .ifEmpty { "vpn_profile" }
        val fileName = "$sanitizedBaseName.$ext"
        
        val cacheDir = File(context.cacheDir, "vpn_profiles").canonicalFile
        if (!cacheDir.exists()) cacheDir.mkdirs()
        
        val configFile = File(cacheDir, fileName).canonicalFile
        if (!configFile.canonicalPath.startsWith(cacheDir.canonicalPath + File.separator)) {
            throw SecurityException("Invalid VPN configuration file path")
        }
        configFile.writeText(configStr)
        
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", configFile)
        
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, if (ext == "conf") "application/x-wireguard-profile" else "application/x-openvpn-profile")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        
        context.startActivity(Intent.createChooser(intent, "Import VPN Configuration"))
    }

    private fun sendResponse(jsonResponse: String) {
        context.runOnUiThread {
            if (NativeSecurity.isTrustedOrigin(webView.url)) {
                webView.evaluateJavascript("window.dispatchAndroidMessage(${JSONObject.quote(jsonResponse)});", null)
            }
        }
    }
}
