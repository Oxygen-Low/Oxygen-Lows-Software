package com.oxygenlow.oxygen_lows_software

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.min

/**
 * Manages the llama.cpp binary and local GGUF models on Android.
 *
 * The cross-compiled llama-server binary is shipped by the release worker as
 * `llama-android-<arch>.zip` on the app's own GitHub release. Only URLs from
 * that release are downloaded, with a size cap and optional SHA-256 check.
 */
class LlamaManager(private val context: Context) {
    private val root = File(context.filesDir, "llama")
    private val binDir = File(root, "bin")
    private val modelsDir = File(root, "models")
    private val configFile = File(root, "config.json")
    private val stateFile = File(root, "state.json")

    private var config = JSONObject()
    private var state = JSONObject()
    private val processes = ConcurrentHashMap<Int, Process>()

    companion object {
        private const val RELEASE_API =
            "https://api.github.com/repos/Oxygen-Low/Oxygen-Lows-Software/releases/latest"
        private const val MAX_ASSET = 2L * 1024 * 1024 * 1024

        fun isReleaseUrl(value: String?): Boolean {
            if (value.isNullOrBlank()) return false
            return try {
                val uri = java.net.URI.create(value)
                uri.scheme == "https" && uri.host in setOf(
                    "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"
                ) && (uri.host != "github.com" || uri.path.startsWith("/Oxygen-Low/Oxygen-Lows-Software/releases/download/"))
            } catch (e: Exception) { false }
        }

        fun isNewer(latest: String, current: String): Boolean {
            if (latest.isBlank()) return false
            if (current.isBlank()) return true
            val a = latest.trimStart('v', 'b').split('.', '-').map { it.toIntOrNull() ?: 0 }
            val b = current.trimStart('v', 'b').split('.', '-').map { it.toIntOrNull() ?: 0 }
            for (i in 0 until maxOf(a.size, b.size)) {
                val av = a.getOrElse(i) { 0 }; val bv = b.getOrElse(i) { 0 }
                if (av != bv) return av > bv
            }
            return false
        }
    }

    init {
        root.mkdirs(); binDir.mkdirs(); modelsDir.mkdirs()
        if (configFile.exists()) config = JSONObject(configFile.readText())
        if (stateFile.exists()) state = JSONObject(stateFile.readText())
    }

    private fun saveConfig() { configFile.writeText(config.toString()) }
    private fun saveState() { stateFile.writeText(state.toString()) }

    val installedVersion: String get() = config.optString("installedVersion", "")
    val ignoredVersion: String get() = config.optString("ignoredVersion", "")
    val modelsPath: String get() = modelsDir.absolutePath
    val binaryPath: String get() = binDir.absolutePath

    fun setIgnoredVersion(v: String) { config.put("ignoredVersion", v); saveConfig() }

    fun isInstalled(): Boolean = installedVersion.isNotBlank() && findServer() != null

    private fun findServer(): File? {
        val candidates = listOf(File(binDir, "llama-server"), File(binDir, "llama-server-arm64"))
        return candidates.firstOrNull { it.exists() && it.canExecute() }
    }

    /** Resolve a model file name inside the models directory (no traversal). */
    private fun resolveModel(name: String): File {
        val clean = File(name).name
        if (clean != name || clean.contains("..")) throw IllegalArgumentException("Invalid model file name")
        val file = File(modelsDir, clean).canonicalFile
        val rootCanonical = modelsDir.canonicalFile
        if (!file.path.startsWith(rootCanonical.path + File.separator)) {
            throw IllegalArgumentException("Path traversal detected")
        }
        return file
    }

    fun checkUpdate(): JSONObject {
        val release = fetchLatestRelease()
        val latest = release.optString("version", "")
        val hasUpdate = isNewer(latest, installedVersion) && latest != ignoredVersion
        return JSONObject().apply {
            put("currentVersion", installedVersion)
            put("latestVersion", latest)
            put("hasUpdate", hasUpdate)
            put("ignored", latest == ignoredVersion && latest.isNotBlank())
            put("releaseUrl", "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases")
        }
    }

    private fun fetchLatestRelease(): JSONObject {
        val conn = URL(RELEASE_API).openConnection() as HttpURLConnection
        conn.connectTimeout = 15000; conn.readTimeout = 15000
        conn.setRequestProperty("Accept", "application/vnd.github+json")
        conn.setRequestProperty("User-Agent", "OxygenLowsSoftware")
        val text = conn.inputStream.bufferedReader().use { it.readText() }
        val root = JSONObject(text)
        val tag = root.optString("tag_name", "")
        val assets = root.optJSONArray("assets") ?: JSONArray()
        return JSONObject().apply {
            put("version", tag.trimStart('v', 'b'))
            put("assets", assets)
        }
    }

    fun install(tag: String = "", onProgress: (Int) -> Unit) {
        val release = if (tag.isBlank()) fetchLatestRelease() else {
            val conn = URL("$RELEASE_API/tags/$tag").openConnection() as HttpURLConnection
            conn.setRequestProperty("Accept", "application/vnd.github+json")
            conn.setRequestProperty("User-Agent", "OxygenLowsSoftware")
            JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
        }
        val version = release.optString("version", "").ifBlank {
            release.optString("tag_name", "").trimStart('v', 'b')
        }
        val assets = release.optJSONArray("assets") ?: JSONArray()
        var chosen: JSONObject? = null
        val abi = android.os.Build.SUPPORTED_ABIS.firstOrNull() ?: "arm64-v8a"
        val wanted = if (abi.contains("arm64")) "arm64" else "arm"
        for (i in 0 until assets.length()) {
            val asset = assets.getJSONObject(i)
            val name = asset.optString("name", "")
            if (!name.contains("llama-android-$wanted") || !name.endsWith(".zip")) continue
            val url = asset.optString("browser_download_url", "")
            if (!isReleaseUrl(url)) continue
            val size = asset.optLong("size", 0)
            if (size <= 0 || size > MAX_ASSET) continue
            chosen = asset; break
        }
        val asset = chosen ?: throw IllegalStateException("No llama.cpp Android binary in this release")
        val url = asset.getString("browser_download_url")
        val expectedSize = asset.optLong("size", 0)
        val digest = asset.optString("digest", "").removePrefix("sha256:")

        val temp = File(context.cacheDir, "llama-download.zip")
        downloadVerified(url, temp, expectedSize, digest, onProgress)

        // Extract only the server binary; use a staging directory.
        val stage = File(root, ".stage")
        stage.deleteRecursively(); stage.mkdirs()
        unzip(temp, stage)
        val server = stage.walkTopDown().firstOrNull { it.name == "llama-server" }
            ?: throw IllegalStateException("Archive did not contain llama-server")
        val target = File(binDir, "llama-server")
        target.delete()
        server.copyTo(target, overwrite = true)
        if (!target.setExecutable(true)) throw IllegalStateException("Could not mark binary executable")
        stage.deleteRecursively(); temp.delete()

        config.put("installedVersion", version)
        config.put("ignoredVersion", "")
        saveConfig()
        onProgress(100)
    }

    private fun downloadVerified(url: String, dest: File, expected: Long, digest: String, onProgress: (Int) -> Unit) {
        var current = url
        var redirects = 0
        while (true) {
            if (!isReleaseUrl(current)) throw IllegalStateException("Invalid download destination")
            val conn = URL(current).openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 20000; conn.readTimeout = 30000
            when (val code = conn.responseCode) {
                in 300..399 -> {
                    val loc = conn.getHeaderField("Location") ?: throw IllegalStateException("Invalid redirect")
                    current = java.net.URI.create(current).resolve(loc).toString()
                    conn.disconnect()
                    if (++redirects > 5) throw IllegalStateException("Too many redirects")
                    continue
                }
                200 -> {
                    val md = if (digest.isNotBlank()) MessageDigest.getInstance("SHA-256") else null
                    var total = 0L
                    val buffer = ByteArray(64 * 1024)
                    FileOutputStream(dest).use { out ->
                        conn.inputStream.use { input ->
                            while (true) {
                                val read = input.read(buffer)
                                if (read <= 0) break
                                total += read
                                if (expected > 0 && total > expected) throw IllegalStateException("Size mismatch")
                                md?.update(buffer, 0, read)
                                out.write(buffer, 0, read)
                                if (expected > 0) onProgress(min(99, (total * 100 / expected).toInt()))
                            }
                        }
                    }
                    if (expected > 0 && total != expected) throw IllegalStateException("Size mismatch")
                    if (md != null && digest.isNotBlank()) {
                        val actual = md.digest().joinToString("") { "%02x".format(it) }
                        if (!actual.equals(digest, ignoreCase = true)) throw IllegalStateException("Integrity check failed")
                    }
                    conn.disconnect()
                    return
                }
                else -> { conn.disconnect(); throw IllegalStateException("Download failed: $code") }
            }
        }
    }

    private fun unzip(zip: File, dest: File) {
        val stream = java.util.zip.ZipInputStream(zip.inputStream().buffered())
        val buf = ByteArray(64 * 1024)
        stream.use { zis ->
            while (true) {
                val entry = zis.nextEntry ?: break
                val name = entry.name.replace('\\', '/')
                if (name.startsWith("/") || name.contains("..")) { zis.closeEntry(); continue }
                val out = File(dest, name)
                if (entry.isDirectory) { out.mkdirs(); zis.closeEntry(); continue }
                out.parentFile?.mkdirs()
                FileOutputStream(out).use { os ->
                    while (true) { val n = zis.read(buf); if (n <= 0) break; os.write(buf, 0, n) }
                }
                zis.closeEntry()
            }
        }
    }

    fun uninstall() {
        stopAll()
        binDir.deleteRecursively(); binDir.mkdirs()
        config.put("installedVersion", "")
        saveConfig()
    }

    private data class ModelGroup(
        val id: String,
        val shards: MutableList<String> = mutableListOf(),
        var expectedShards: Int = 1,
        var mmproj: String = "",
        var sizeBytes: Long = 0
    )

    private val shardRegex = Regex("^(.+?)-(\\d{5})-of-(\\d{5})\\.gguf$", RegexOption.IGNORE_CASE)

    /** Groups GGUF files into models; split files become one model. */
    private fun buildModelGroups(): List<ModelGroup> {
        val files = modelsDir.listFiles { f -> f.extension.equals("gguf", true) }?.toList() ?: emptyList()
        val groups = LinkedHashMap<String, ModelGroup>()
        val projectors = mutableListOf<String>()
        for (file in files) {
            val name = file.name
            if (name.startsWith("mmproj", true)) { projectors.add(name); continue }
            val match = shardRegex.matchEntire(name)
            val id = match?.groupValues?.get(1) ?: name
            val expected = match?.groupValues?.getOrNull(3)?.toIntOrNull()?.coerceAtLeast(1) ?: 1
            val group = groups.getOrPut(id) { ModelGroup(id) }
            group.expectedShards = maxOf(group.expectedShards, expected)
            group.shards.add(name)
            group.sizeBytes += file.length()
        }
        for (group in groups.values) {
            group.shards.sortBy { shardRegex.matchEntire(it)?.groupValues?.getOrNull(2)?.toIntOrNull() ?: Int.MAX_VALUE }
            val family = group.id.split('-').take(2).joinToString("-").lowercase()
            group.mmproj = projectors.firstOrNull { it.lowercase().contains(family) } ?: ""
        }
        return groups.values.sortedBy { it.id }
    }

    private fun findSettings(id: String, group: ModelGroup): JSONObject {
        state.optJSONObject(id)?.let { return it }
        group.shards.firstOrNull()?.let { state.optJSONObject(it)?.let { return it } }
        return JSONObject()
    }

    fun listModels(): JSONArray {
        val arr = JSONArray()
        for (group in buildModelGroups()) {
            val settings = findSettings(group.id, group)
            val mmproj = settings.optString("mmproj", "").ifBlank { group.mmproj }
            val hasVision = mmproj.isNotBlank() && resolveModel(mmproj).exists()
            val complete = group.shards.size >= group.expectedShards &&
                group.shards.all { resolveModel(it).exists() }
            val shards = JSONArray(); group.shards.forEach { shards.put(it) }
            arr.put(JSONObject().apply {
                put("id", group.id)
                put("fileName", group.shards.first())
                put("displayName", settings.optString("displayName", group.id))
                put("source", settings.optString("source", "manual"))
                put("sourceId", settings.optString("sourceId", ""))
                put("mmap", settings.optBoolean("mmap", true))
                put("contextSize", settings.optInt("contextSize", 4096))
                put("gpuLayers", settings.optInt("gpuLayers", -1))
                put("port", settings.optInt("port", 0))
                put("sizeBytes", group.sizeBytes)
                put("isRunning", processes.containsKey(settings.optInt("port", 0)))
                put("shards", shards)
                put("shardCount", group.shards.size)
                put("shardExpected", group.expectedShards)
                put("shardsComplete", complete)
                put("hasVision", hasVision)
                put("mmproj", if (hasVision) mmproj else "")
                put("useJinja", settings.optBoolean("useJinja", false))
            })
        }
        return arr
    }

    fun saveModelSettings(settings: JSONObject) {
        val modelId = settings.optString("id", "").ifBlank { File(settings.optString("fileName", "")).name }
        require(modelId.isNotBlank()) { "Model id is required" }
        val existing = state.optJSONObject(modelId) ?: JSONObject()
        existing.put("id", modelId)
        if (settings.has("fileName")) existing.put("fileName", File(settings.optString("fileName", "")).name)
        existing.put("displayName", settings.optString("displayName", existing.optString("displayName", modelId)))
        existing.put("source", settings.optString("source", existing.optString("source", "manual")))
        existing.put("sourceId", settings.optString("sourceId", existing.optString("sourceId", "")))
        if (settings.has("mmproj")) existing.put("mmproj", File(settings.optString("mmproj", "")).name)
        existing.put("useJinja", settings.optBoolean("useJinja", existing.optBoolean("useJinja", false)))
        existing.put("mmap", settings.optBoolean("mmap", true))
        existing.put("contextSize", settings.optInt("contextSize", 4096))
        existing.put("gpuLayers", settings.optInt("gpuLayers", -1))
        existing.put("port", settings.optInt("port", 0))
        state.put(modelId, existing); saveState()
    }

    fun saveUploadedModel(fileName: String, bytes: ByteArray, mmap: Boolean, onProgress: (Int) -> Unit) {
        val file = resolveModel(fileName)
        val temp = File(file.path + ".upload")
        FileOutputStream(temp).use { out ->
            val chunk = 1 shl 20
            var offset = 0
            while (offset < bytes.size) {
                val len = minOf(chunk, bytes.size - offset)
                out.write(bytes, offset, len); offset += len
                onProgress((offset * 100 / maxOf(1, bytes.size)))
            }
        }
        if (file.exists()) file.delete()
        temp.renameTo(file)
        saveModelSettings(JSONObject().apply { put("fileName", fileName); put("mmap", mmap) })
        onProgress(100)
    }

    fun deleteModel(modelId: String) {
        val group = buildModelGroups().firstOrNull { it.id.equals(modelId, true) || it.shards.any { s -> s.equals(modelId, true) } }
        if (group != null) {
            group.shards.forEach { resolveModel(it).takeIf { f -> f.exists() }?.delete() }
            state.remove(group.id)
        } else {
            resolveModel(modelId).takeIf { it.exists() }?.delete()
        }
        state.remove(modelId)
        saveState()
    }

    fun importModel(sourcePath: String): String {
        val source = File(sourcePath)
        require(source.exists()) { "Source file not found" }
        val name = source.name
        source.copyTo(resolveModel(name), overwrite = true)
        saveModelSettings(JSONObject().apply { put("fileName", name); put("id", name); put("mmap", true) })
        return name
    }

    fun start(modelId: String, port: Int, mmap: Boolean, contextSize: Int, gpuLayers: Int): Int {
        val exe = findServer() ?: throw IllegalStateException("llama.cpp is not installed")
        val group = buildModelGroups().firstOrNull { it.id.equals(modelId, true) || it.shards.any { s -> s.equals(modelId, true) } }
            ?: throw IllegalStateException("Model not found")
        if (group.shards.size < group.expectedShards)
            throw IllegalStateException("Model incomplete: ${group.shards.size}/${group.expectedShards} shards")
        val model = resolveModel(group.shards.first())
        require(model.exists()) { "Model file not found" }
        val settings = findSettings(group.id, group)
        var actualPort = if (port > 0) port else 8100 + (state.length() % 100)
        var args = listOf(
            "-m", model.absolutePath, "--host", "127.0.0.1", "--port", actualPort.toString(),
            "-c", contextSize.coerceIn(512, 131072).toString()
        ).toMutableList()
        if (mmap) args.add("--mmap")
        if (gpuLayers >= 0) args.addAll(listOf("-ngl", gpuLayers.coerceAtMost(9999).toString()))
        val mmproj = settings.optString("mmproj", "").ifBlank { group.mmproj }
        if (mmproj.isNotBlank() && resolveModel(mmproj).exists())
            args.addAll(listOf("--mmproj", resolveModel(mmproj).absolutePath))
        if (settings.optBoolean("useJinja", false)) args.add("--jinja")

        val builder = ProcessBuilder(listOf(exe.absolutePath) + args)
            .directory(binDir)
            .redirectErrorStream(true)
        val process = builder.start()
        processes[actualPort] = process
        val s = settings
        s.put("id", group.id)
        s.put("port", actualPort); s.put("mmap", mmap)
        s.put("contextSize", contextSize); s.put("gpuLayers", gpuLayers)
        state.put(group.id, s); saveState()
        return actualPort
    }

    fun stop(instanceId: Int) {
        processes.remove(instanceId)?.let { try { it.destroy() } catch (_: Exception) {} }
        for (key in state.keys()) {
            val s = state.optJSONObject(key) ?: continue
            if (s.optInt("port", 0) == instanceId) s.put("port", 0)
        }
        saveState()
    }

    fun stopAll() {
        processes.values.forEach { try { it.destroy() } catch (_: Exception) {} }
        processes.clear()
        for (key in state.keys()) { (state.optJSONObject(key) ?: continue).put("port", 0) }
        saveState()
    }

    fun listRunning(): JSONArray {
        val arr = JSONArray()
        for (key in state.keys()) {
            val s = state.optJSONObject(key) ?: continue
            val port = s.optInt("port", 0)
            if (port <= 0 || !processes.containsKey(port)) continue
            arr.put(JSONObject().apply {
                put("instanceId", port); put("port", port)
                put("modelId", s.optString("id", key)); put("modelFile", key)
                put("displayName", s.optString("displayName", key))
                put("baseUrl", "http://127.0.0.1:$port")
                put("mmap", s.optBoolean("mmap", true))
                put("contextSize", s.optInt("contextSize", 4096))
                put("gpuLayers", s.optInt("gpuLayers", -1))
                put("hasVision", s.optString("mmproj", "").isNotBlank())
                put("useJinja", s.optBoolean("useJinja", false))
            })
        }
        return arr
    }

    fun status(): JSONObject = JSONObject().apply {
        put("installed", isInstalled())
        put("installedVersion", installedVersion)
        put("ignoredVersion", ignoredVersion)
        put("autoCheckUpdates", true)
        put("binaryPath", binaryPath)
        put("modelsPath", modelsPath)
        put("running", listRunning())
    }
}
