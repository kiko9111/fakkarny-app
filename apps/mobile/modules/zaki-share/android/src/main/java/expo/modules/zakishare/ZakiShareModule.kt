package expo.modules.zakishare

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * "Share to Zaki" from WhatsApp or any app (Android builds from 2026-11-27 on). The main activity
 * takes ACTION_SEND / ACTION_SEND_MULTIPLE for text and images (app.json intentFilters); this module
 * hands what was shared to JavaScript once: the words, and a photo copied into the app's cache
 * (receipts are the only photos Zaki reads, and only when the user taps). A shared .txt file (a
 * WhatsApp chat export) is read as words, its newest part. Nothing leaves the phone from here.
 */
class ZakiShareModule : Module() {
  private val context: Context get() = requireNotNull(appContext.reactContext) { "no context" }

  /** A share that arrived while the app was running, until JavaScript takes it. */
  private var pending: Map<String, Any?>? = null

  override fun definition() = ModuleDefinition {
    Name("ZakiShare")
    Events("onShare")

    /** What was shared ({text, subject, images, other}), or null. Each share is handed over once. */
    Function("take") {
      val out = pending ?: appContext.currentActivity?.intent?.let { read(it) }
      pending = null
      out
    }

    OnNewIntent { intent ->
      val share = read(intent) ?: return@OnNewIntent
      pending = share
      sendEvent("onShare", mapOf("ready" to true))
    }
  }

  private fun read(intent: Intent): Map<String, Any?>? {
    val action = intent.action
    if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return null
    var text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
    val streams = streamsOf(intent, action)
    // Read once: a reload of the JavaScript (an over-the-air update) must not find it again.
    intent.action = Intent.ACTION_MAIN
    intent.removeExtra(Intent.EXTRA_TEXT)
    intent.removeExtra(Intent.EXTRA_SUBJECT)
    intent.removeExtra(Intent.EXTRA_STREAM)

    val images = mutableListOf<String>()
    var other = 0
    for (uri in streams.take(MAX_STREAMS)) {
      val type = runCatching { context.contentResolver.getType(uri) }.getOrNull() ?: intent.type ?: ""
      when {
        type.startsWith("image/") && images.isEmpty() -> copyImage(uri)?.let { images.add(it) } ?: run { other++ }
        type.startsWith("text/") && text.isNullOrBlank() -> text = readText(uri) ?: run { other++; null }
        else -> other++
      }
    }
    if (text.isNullOrBlank() && subject.isNullOrBlank() && images.isEmpty() && other == 0) return null
    return mapOf("text" to text, "subject" to subject, "images" to images, "other" to other)
  }

  @Suppress("DEPRECATION")
  private fun streamsOf(intent: Intent, action: String): List<Uri> =
    if (action == Intent.ACTION_SEND) {
      val one = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
      listOfNotNull(one)
    } else {
      (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)) ?: emptyList()
    }

  /** The photo into the app's cache (the grant to read the other app's file ends with the activity). */
  private fun copyImage(uri: Uri): String? = runCatching {
    val dir = File(context.cacheDir, "zaki-share").apply { mkdirs() }
    // Only the newest share is kept.
    dir.listFiles()?.forEach { it.delete() }
    val file = File(dir, "shared-${System.currentTimeMillis()}.img")
    context.contentResolver.openInputStream(uri)?.use { input ->
      file.outputStream().use { out ->
        val buffer = ByteArray(64 * 1024)
        var total = 0L
        while (true) {
          val n = input.read(buffer)
          if (n < 0) break
          total += n
          if (total > MAX_IMAGE_BYTES) throw IllegalStateException("too big")
          out.write(buffer, 0, n)
        }
      }
    } ?: return null
    Uri.fromFile(file).toString()
  }.getOrNull()

  /** A text file (a chat export): its newest part, where the latest messages are. */
  private fun readText(uri: Uri): String? = runCatching {
    context.contentResolver.openInputStream(uri)?.use { input ->
      val bytes = input.readBytes()
      val all = String(if (bytes.size > MAX_TEXT_BYTES) bytes.copyOfRange(bytes.size - MAX_TEXT_BYTES, bytes.size) else bytes, Charsets.UTF_8)
      all.takeLast(MAX_TEXT_CHARS)
    }
  }.getOrNull()

  companion object {
    const val MAX_STREAMS = 10
    const val MAX_IMAGE_BYTES = 25L * 1024 * 1024
    const val MAX_TEXT_BYTES = 64 * 1024
    const val MAX_TEXT_CHARS = 6000
  }
}
