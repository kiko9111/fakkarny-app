package expo.modules.zakialarm

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Full-screen alarms for reminders the user asked to ring like an alarm. JavaScript (src/notifications)
 * schedules each alarm notification here instead of through expo-notifications when this module is
 * in the build. Everything is local: nothing is sent anywhere.
 */
class ZakiAlarmModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext) { "no context" }

  override fun definition() = ModuleDefinition {
    Name("ZakiAlarm")

    /** Replaces an alarm with the same id. `at` is milliseconds since 1970 (UTC). */
    Function("schedule") { o: Map<String, Any?> ->
      val alarm = Alarm(
        id = o["id"] as String,
        at = (o["at"] as Number).toLong(),
        title = o["title"] as? String ?: "Zaki",
        body = o["body"] as? String ?: "",
        stop = o["stop"] as? String ?: "Stop",
        snooze = o["snooze"] as? String ?: "Snooze",
        open = o["open"] as? String ?: "Open",
        channel = o["channel"] as? String ?: "Alarms",
        snoozeMinutes = (o["snoozeMinutes"] as? Number)?.toInt() ?: 10,
      )
      Alarms.schedule(context, alarm)
      true
    }

    Function("cancel") { id: String -> Alarms.cancel(context, id); true }

    Function("cancelAll") { Alarms.cancelAll(context); true }

    /** Alarms still to ring (snoozes left out), as {identifier, at}. */
    Function("list") {
      Alarms.all(context).filter { !it.id.endsWith(Alarms.SNOOZE) }.map { mapOf("identifier" to it.id, "at" to it.at.toDouble()) }
    }

    Function("status") {
      mapOf("exact" to Alarms.canExact(context), "fullScreen" to Alarms.canFullScreen(context))
    }

    /** Settings > Alarms & reminders for this app (Android 12+). */
    Function("openExactSettings") {
      if (Build.VERSION.SDK_INT < 31) return@Function false
      open(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName)))
    }

    /** Settings > full-screen notifications for this app (Android 14+). */
    Function("openFullScreenSettings") {
      if (Build.VERSION.SDK_INT < 34) return@Function false
      open(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + context.packageName)))
    }
  }

  private fun open(i: Intent): Boolean = try {
    context.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    true
  } catch (_: Exception) {
    false
  }
}
