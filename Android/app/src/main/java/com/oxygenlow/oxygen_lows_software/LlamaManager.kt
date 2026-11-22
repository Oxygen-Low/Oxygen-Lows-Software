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
        // Only 64-bit ARM binaries are shipped (upstream llama.cpp does not
        // build for armeabi-v7a). Google Play requires 64-bit support anyway.
        val hasArm64 = android.os.Build.SUPPORTED_ABIS.any { it.contains("arm64", true) }
        if (!hasArm64) throw IllegalStateException("This device is not 64-bit ARM; a compatible llama.cpp build is not available")
        val wanted = "arm64"
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
        val shardPaths: MutableList<String> = mutableListOf(),
        var expectedShards: Int = 1,
        var mmproj: String = "",
        var mmprojPath: String = "",
        var sizeBytes: Long = 0,
        var referenced: Boolean = false
    )

    private val shardRegex = Regex("^(.+?)-(\\d{5})-of-(\\d{5})\\.gguf$", RegexOption.IGNORE_CASE)

    private fun familyOf(nameOrId: String): String {
        var value = nameOrId
        if (value.startsWith("mmproj", true)) value = value.substring(6).trim('-', '_', '.')
        if (value.endsWith(".gguf", true)) value = value.dropLast(5)
        return value.split('-').take(2).joinToString("-").lowercase()
    }

    private fun isInsideModelsDir(path: String): Boolean = try {
        val canonical = File(path).canonicalFile
        canonical.path.startsWith(modelsDir.canonicalFile.path + File.separator)
    } catch (e: Exception) { false }

    /** Groups GGUF files into models; split files become one model. */
    private fun buildModelGroups(): List<ModelGroup> {
        modelsDir.mkdirs()
        val groups = LinkedHashMap<String, ModelGroup>()
        val projectors = mutableListOf<File>()
        val files = modelsDir.listFiles { f -> f.extension.equals("gguf", true) }?.toList() ?: emptyList()
        for (file in files) {
            val name = file.name
            if (name.startsWith("mmproj", true)) { projectors.add(file); continue }
            val match = shardRegex.matchEntire(name)
            val id = match?.groupValues?.get(1) ?: name
            val expected = match?.groupValues?.getOrNull(3)?.toIntOrNull()?.coerceAtLeast(1) ?: 1
            val group = groups.getOrPut(id) { ModelGroup(id) }
            group.expectedShards = maxOf(group.expectedShards, expected)
            group.shards.add(name)
            group.shardPaths.add(file.absolutePath)
            group.sizeBytes += file.length()
        }
        for (group in groups.values) {
            val order = group.shards.indices.sortedBy {
                shardRegex.matchEntire(group.shards[it])?.groupValues?.getOrNull(2)?.toIntOrNull() ?: Int.MAX_VALUE
            }
            val names = order.map { group.shards[it] }
            val paths = order.map { group.shardPaths[it] }
            group.shards.clear(); group.shards.addAll(names)
            group.shardPaths.clear(); group.shardPaths.addAll(paths)
            val family = familyOf(group.id)
            val projector = projectors.firstOrNull { familyOf(it.name) == family }
                ?: projectors.firstOrNull { it.name.lowercase().contains(family) }
            if (projector != null) {
                group.mmproj = projector.name
                group.mmprojPath = projector.absolutePath
            }
        }

        // Models imported by reference (paths recorded in state.json).
        for (key in state.keys()) {
            val settings = state.optJSONObject(key) ?: continue
            val pathsArray = settings.optJSONArray("paths") ?: continue
            val paths = (0 until pathsArray.length()).mapNotNull {
                pathsArray.optString(it, "").takeIf { p -> p.isNotBlank() }
            }
            if (paths.isEmpty()) continue
            val group = groups.getOrPut(key) { ModelGroup(key) }
            group.referenced = true
            group.shards.clear(); group.shardPaths.clear()
            var expected = 1
            for (path in paths) {
                val file = File(path)
                group.shards.add(file.name)
                group.shardPaths.add(path)
                shardRegex.matchEntire(file.name)?.groupValues?.getOrNull(3)?.toIntOrNull()?.let {
                    expected = maxOf(expected, it)
                }
                if (file.exists()) group.sizeBytes += file.length()
            }
            group.expectedShards = maxOf(group.expectedShards, expected)
            group.mmproj = settings.optString("mmproj", "")
            group.mmprojPath = settings.optString("mmprojPath", "")
            if (group.mmprojPath.isBlank() && group.mmproj.isNotBlank()) {
                group.mmprojPath = File(modelsDir, File(group.mmproj).name).absolutePath
            }
        }
        return groups.values.sortedBy { it.id }
    }

    private fun findSettings(id: String, group: ModelGroup): JSONObject {
        state.optJSONObject(id)?.let { return it }
        group.shards.firstOrNull()?.let { state.optJSONObject(it)?.let { return it } }
        return JSONObject()
    }

    private fun resolveMmprojPath(settings: JSONObject, group: ModelGroup): String {
        val stored = settings.optString("mmprojPath", "")
        if (stored.isNotBlank() && File(stored).exists()) return stored
        val name = settings.optString("mmproj", "").ifBlank { group.mmproj }
        if (name.isBlank()) return ""
        if (group.mmprojPath.isNotBlank() && File(group.mmprojPath).name == name) return group.mmprojPath
        return File(modelsDir, File(name).name).absolutePath
    }

    fun listModels(): JSONArray {
        val arr = JSONArray()
        for (group in buildModelGroups()) {
            val settings = findSettings(group.id, group)
            val mmprojPath = resolveMmprojPath(settings, group)
            val hasVision = mmprojPath.isNotBlank() && File(mmprojPath).exists()
            val complete = group.shards.size >= group.expectedShards &&
                group.shardPaths.all { File(it).exists() }
            val shards = JSONArray(); group.shards.forEach { shards.put(it) }
            arr.put(JSONObject().apply {
                put("id", group.id)
                put("fileName", group.shards.firstOrNull() ?: "")
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
                put("mmproj", if (hasVision) File(mmprojPath).name else "")
                put("useJinja", settings.optBoolean("useJinja", false))
                put("referenced", group.referenced)
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
        if (settings.has("mmproj")) {
            val name = File(settings.optString("mmproj", "")).name
            existing.put("mmproj", name)
            val storedPath = existing.optString("mmprojPath", "")
            if (storedPath.isNotBlank() && File(storedPath).name != name) existing.remove("mmprojPath")
        }
        existing.put("useJinja", settings.optBoolean("useJinja", existing.optBoolean("useJinja", false)))
        existing.put("mmap", settings.optBoolean("mmap", true))
        existing.put("contextSize", settings.optInt("contextSize", 4096))
        existing.put("gpuLayers", settings.optInt("gpuLayers", -1))
        existing.put("port", settings.optInt("port", 0))
        state.put(modelId, existing); saveState()
    }

    fun deleteModel(modelId: String) {
        val group = buildModelGroups().firstOrNull { it.id.equals(modelId, true) || it.shards.any { s -> s.equals(modelId, true) } }
        if (group != null) {
            // Only delete files that live in our own models folder; imported
            // files elsewhere belong to the user.
            group.shardPaths.filter { isInsideModelsDir(it) }
                .forEach { File(it).takeIf { f -> f.exists() }?.delete() }
            if (group.mmprojPath.isNotBlank() && isInsideModelsDir(group.mmprojPath)) {
                File(group.mmprojPath).takeIf { it.exists() }?.delete()
            }
            state.remove(group.id)
        }
        state.remove(modelId)
        saveState()
    }

    private fun uriDisplayName(uri: android.net.Uri): String? = try {
        context.contentResolver.query(
            uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null
        )?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }
    } catch (e: Exception) { null }

    private fun copyToModels(uri: android.net.Uri, name: String): File {
        val target = resolveModel(name)
        val temp = File(target.path + ".import")
        val input = context.contentResolver.openInputStream(uri)
            ?: throw IllegalStateException("Could not open the selected file")
        input.use { source -> FileOutputStream(temp).use { out -> source.copyTo(out) } }
        if (target.exists()) target.delete()
        if (!temp.renameTo(target)) { temp.copyTo(target, overwrite = true); temp.delete() }
        return target
    }

    private fun copyToModels(source: File, name: String): File {
        val target = resolveModel(name)
        if (source.canonicalPath != target.canonicalPath) source.copyTo(target, overwrite = true)
        return target
    }

    private fun materialize(source: String): File? = try {
        when {
            source.startsWith("content://") || source.startsWith("file://") -> {
                val uri = android.net.Uri.parse(source)
                val name = uriDisplayName(uri)
                    ?: uri.lastPathSegment?.substringAfterLast('/')
                    ?: return null
                if (!name.endsWith(".gguf", true)) null else copyToModels(uri, File(name).name)
            }
            else -> {
                val file = File(source)
                when {
                    !file.exists() || !file.name.endsWith(".gguf", true) -> null
                    isInsideModelsDir(file.absolutePath) -> file
                    else -> copyToModels(file, file.name)
                }
            }
        }
    } catch (e: Exception) { null }

    /**
     * Imports GGUF files chosen through the system picker. Android exposes
     * document URIs rather than stable file paths, so selected files are copied
     * into app storage before llama-server can open them.
     */
    fun importFiles(sources: List<String>): List<String> {
        require(sources.isNotEmpty()) { "No files were selected" }
        var copied = 0
        for (source in sources) {
            if (materialize(source) != null) copied++
        }
        if (copied == 0) throw IllegalStateException("No GGUF files were selected")

        val ids = mutableListOf<String>()
        for (group in buildModelGroups()) {
            if (state.optJSONObject(group.id) == null) {
                state.put(group.id, JSONObject().apply {
                    put("id", group.id)
                    put("fileName", group.shards.firstOrNull() ?: "")
                    put("displayName", group.id)
                    put("shards", JSONArray().apply { group.shards.forEach { put(it) } })
                    put("mmproj", group.mmproj)
                    put("mmap", true)
                    put("useJinja", group.id.contains("hy4", true))
                })
            }
            ids.add(group.id)
        }
        if (ids.isEmpty()) throw IllegalStateException("No GGUF model files were selected")
        saveState()
        return ids
    }

    fun start(modelId: String, port: Int, mmap: Boolean, contextSize: Int, gpuLayers: Int): Int {
        val exe = findServer() ?: throw IllegalStateException("llama.cpp is not installed")
        val group = buildModelGroups().firstOrNull { it.id.equals(modelId, true) || it.shards.any { s -> s.equals(modelId, true) } }
            ?: throw IllegalStateException("Model not found")
        if (group.shards.size < group.expectedShards)
            throw IllegalStateException("Model incomplete: ${group.shards.size}/${group.expectedShards} shards")
        val model = File(group.shardPaths.firstOrNull() ?: "")
        require(model.exists()) { "Model file not found" }
        val settings = findSettings(group.id, group)
        var actualPort = if (port > 0) port else 8100 + (state.length() % 100)
        var args = listOf(
            "-m", model.absolutePath, "--host", "127.0.0.1", "--port", actualPort.toString(),
            "-c", contextSize.coerceIn(512, 131072).toString()
        ).toMutableList()
        if (mmap) args.add("--mmap")
        if (gpuLayers >= 0) args.addAll(listOf("-ngl", gpuLayers.coerceAtMost(9999).toString()))
        val mmproj = resolveMmprojPath(settings, group)
        if (mmproj.isNotBlank() && File(mmproj).exists())
            args.addAll(listOf("--mmproj", mmproj))
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
