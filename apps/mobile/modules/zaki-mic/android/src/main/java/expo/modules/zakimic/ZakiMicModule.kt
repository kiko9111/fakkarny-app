package expo.modules.zakimic

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

/**
 * Voice typing's microphone: 16 kHz mono 16-bit PCM kept in memory only, handed to JavaScript
 * once on stop (base64) for whisper.cpp, then dropped. Nothing is written to disk or sent.
 * At most 60 seconds are kept. The app asks for RECORD_AUDIO before calling start().
 */
class ZakiMicModule : Module() {
  private val rate = 16000
  private val maxBytes = 60 * rate * 2
  private var record: AudioRecord? = null
  private var reader: Thread? = null
  @Volatile private var running = false
  private val buffer = ByteArrayOutputStream()

  @SuppressLint("MissingPermission")
  override fun definition() = ModuleDefinition {
    Name("ZakiMic")

    Function("start") {
      if (running) return@Function true
      val min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      val rec = AudioRecord(
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        rate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        maxOf(min, 8192)
      )
      if (rec.state != AudioRecord.STATE_INITIALIZED) {
        rec.release()
        throw IllegalStateException("microphone not available")
      }
      synchronized(buffer) { buffer.reset() }
      record = rec
      running = true
      rec.startRecording()
      reader = Thread {
        val chunk = ByteArray(4096)
        while (running) {
          val n = rec.read(chunk, 0, chunk.size)
          if (n > 0) synchronized(buffer) { if (buffer.size() < maxBytes) buffer.write(chunk, 0, n) }
        }
      }.also { it.start() }
      true
    }

    Function("stop") {
      running = false
      reader?.join(800)
      reader = null
      record?.let {
        try { it.stop() } catch (_: Exception) {}
        it.release()
      }
      record = null
      val bytes = synchronized(buffer) { buffer.toByteArray().also { buffer.reset() } }
      Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    Function("isRecording") { running }
  }
}
