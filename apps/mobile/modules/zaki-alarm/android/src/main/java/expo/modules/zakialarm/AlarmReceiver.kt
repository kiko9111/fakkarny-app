package expo.modules.zakialarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** The alarm's time came, or Stop / Snooze was tapped on its notification. */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(Alarms.EXTRA_ID) ?: return
    when (intent.action) {
      Alarms.ACTION_FIRE -> Alarms.ring(context, id)
      Alarms.ACTION_STOP -> Alarms.stopRinging(context, id)
      Alarms.ACTION_SNOOZE -> Alarms.snooze(context, id)
    }
  }
}

/** AlarmManager forgets everything on a reboot; an app update or newly allowed exact alarms re-arm too. */
class AlarmBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED,
      "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED" -> Alarms.rearm(context)
    }
  }
}
