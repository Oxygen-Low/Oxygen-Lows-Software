package com.oxygenlow.oxygen_lows_software

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import org.json.JSONObject
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var webAppInterface: WebAppInterface

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
        webView.addJavascriptInterface(webAppInterface, "AndroidApp")

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                injectPolyfill()
            }
        }
        
        webView.webChromeClient = WebChromeClient()

        var url = "https://oxygenlow.com/?desktop=1&android=1"
        val data = intent.data
        if (data != null && data.scheme == "oxygenlows" && data.host == "auth" && data.path == "/callback") {
            val fragment = data.fragment
            if (fragment != null) {
                url += "#$fragment"
            }
        }
        // Load the web app with android=1 param
        webView.loadUrl(url)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val data = intent.data
        if (data != null && data.scheme == "oxygenlows" && data.host == "auth" && data.path == "/callback") {
            val fragment = data.fragment
            if (fragment != null) {
                val url = "https://oxygenlow.com/?desktop=1&android=1#$fragment"
                webView.loadUrl(url)
            }
        }
    }

    private fun injectPolyfill() {
        val js = """
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
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }
}

class WebAppInterface(private val context: Activity, private val webView: WebView) {

    @JavascriptInterface
    fun postMessage(message: String) {
        try {
            val json = JSONObject(message)
            val command = json.optString("command")
            val id = json.optString("id")

            when (command) {
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
        val fileName = "${name.replace(Regex("[^a-zA-Z0-9.-]"), "_")}.$ext"
        
        val cacheDir = File(context.cacheDir, "vpn_profiles")
        if (!cacheDir.exists()) cacheDir.mkdirs()
        
        val configFile = File(cacheDir, fileName)
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
            webView.evaluateJavascript("window.dispatchAndroidMessage('${jsonResponse.replace("'", "\\'")}');", null)
        }
    }
}
