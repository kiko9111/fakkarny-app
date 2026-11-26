package expo.modules.zakialarm

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.app.Notification
import org.json.JSONObject

/** One alarm as JavaScript scheduled it. Words come from the app (its language), nothing is fetched. */
data class Alarm(
  val id: String,
  val at: Long,
  val title: String,
  val body: String,
  val stop: String,
  val snooze: String,
  val open: String,
  val channel: String,
  val snoozeMinutes: Int,
) {
  fun toJson(): String = JSONObject()
    .put("id", id).put("at", at).put("title", title).put("body", body)
    .put("stop", stop).put("snooze", snooze).put("open", open).put("channel", channel)
    .put("snoozeMinutes", snoozeMinutes)
    .toString()

  companion object {
    fun fromJson(raw: String): Alarm? = try {
      val o = JSONObject(raw)
      Alarm(
        o.getString("id"), o.getLong("at"), o.optString("title", "Zaki"), o.optString("body", ""),
        o.optString("stop", "Stop"), o.optString("snooze", "Snooze"), o.optString("open", "Open"),
        o.optString("channel", "Alarms"), o.optInt("snoozeMinutes", 10),
      )
    } catch (_: Exception) {
      null
    }
  }
}

/**
 * Alarms kept in SharedPreferences (so a reboot or an app update can put them back) and set with
 * AlarmManager. A snooze has the alarm's id plus SNOOZE and is never listed to JavaScript, so the
 * app's own record of what it scheduled stays true.
 */
object Alarms {
  const val SNOOZE = "~snooze"
  const val ACTION_FIRE = "expo.modules.zakialarm.FIRE"
  const val ACTION_STOP = "expo.modules.zakialarm.STOP"
  const val ACTION_SNOOZE = "expo.modules.zakialarm.SNOOZE"
  const val EXTRA_ID = "id"
  private const val PREFS = "zaki_alarms"
  private const val RING_CHANNEL = "zaki_alarm_ring"
  /** An alarm that rings with nobody answering stops by itself after this long. */
  private const val RING_FOR_MS = 10 * 60_000L
  /** After a reboot, an alarm missed by less than this still rings. */
  private const val LATE_OK_MS = 30 * 60_000L

  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun all(c: Context): List<Alarm> = prefs(c).all.values.mapNotNull { (it as? String)?.let(Alarm::fromJson) }

  fun get(c: Context, id: String): Alarm? = prefs(c).getString(id, null)?.let(Alarm::fromJson)

  private fun am(c: Context) = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  fun canExact(c: Context): Boolean = Build.VERSION.SDK_INT < 31 || am(c).canScheduleExactAlarms()

  fun canFullScreen(c: Context): Boolean {
    if (Build.VERSION.SDK_INT < 34) return true
    return (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).canUseFullScreenIntent()
  }

  fun notificationId(id: String) = id.removeSuffix(SNOOZE).hashCode()

  private fun fireIntent(c: Context, id: String): PendingIntent {
    val i = Intent(c, AlarmReceiver::class.java).setAction(ACTION_FIRE).setData(Uri.parse("zakialarm://fire/" + Uri.encode(id)))
      .putExtra(EXTRA_ID, id)
    return PendingIntent.getBroadcast(c, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  fun openAppIntent(c: Context): PendingIntent? {
    val launch = c.packageManager.getLaunchIntentForPackage(c.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(c, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  fun schedule(c: Context, alarm: Alarm) {
    prefs(c).edit().putString(alarm.id, alarm.toJson()).apply()
    arm(c, alarm)
  }

  /** Exact (and shown as the next alarm in the status bar) when allowed; otherwise as close as Android lets it. */
  private fun arm(c: Context, alarm: Alarm) {
    val pi = fireIntent(c, alarm.id)
    if (canExact(c)) {
      val show = openAppIntent(c) ?: pi
      am(c).setAlarmClock(AlarmManager.AlarmClockInfo(alarm.at, show), pi)
    } else {
      am(c).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.at, pi)
    }
  }

  /** Cancels the alarm, its snooze, and stops it if it is ringing. */
  fun cancel(c: Context, id: String) {
    for (key in listOf(id, id + SNOOZE)) {
      prefs(c).edit().remove(key).apply()
      am(c).cancel(fireIntent(c, key))
    }
    stopRinging(c, id)
  }

  fun cancelAll(c: Context) {
    for (a in all(c)) cancel(c, a.id.removeSuffix(SNOOZE))
    prefs(c).edit().clear().apply()
  }

  /** Puts every kept alarm back (after a reboot, an app update, or exact alarms being allowed). */
  fun rearm(c: Context) {
    val now = System.currentTimeMillis()
    for (a in all(c)) {
      when {
        a.at > now -> arm(c, a)
        now - a.at < LATE_OK_MS -> ring(c, a.id)
        else -> prefs(c).edit().remove(a.id).apply()
      }
    }
  }

  fun stopRinging(c: Context, id: String) {
    (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(notificationId(id))
    AlarmActivity.close(id.removeSuffix(SNOOZE))
  }

  fun snooze(c: Context, id: String) {
    val base = id.removeSuffix(SNOOZE)
    val alarm = get(c, id) ?: rung(c).getString(base, null)?.let(Alarm::fromJson) ?: return
    stopRinging(c, base)
    schedule(c, alarm.copy(id = base + SNOOZE, at = System.currentTimeMillis() + alarm.snoozeMinutes * 60_000L))
  }

  /** Rung alarms leave the list JavaScript reads, but Snooze still needs their words (kept apart). */
  private fun rung(c: Context) = c.getSharedPreferences(PREFS + "_rung", Context.MODE_PRIVATE)

  private fun ensureChannel(c: Context, name: String) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(RING_CHANNEL) != null) return
    val ch = NotificationChannel(RING_CHANNEL, name, NotificationManager.IMPORTANCE_HIGH)
    val sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    ch.setSound(sound, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
    ch.enableVibration(true)
    ch.vibrationPattern = longArrayOf(0, 800, 400, 800, 400, 800)
    ch.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    ch.setBypassDnd(true)
    nm.createNotificationChannel(ch)
  }

  /**
   * Rings: a notification on the alarm channel whose sound repeats until it is answered (insistent),
   * stopping by itself after RING_FOR_MS, with Stop / Snooze. Over the lock screen it opens
   * AlarmActivity full screen (where allowed); on an unlocked phone Android shows it as a banner.
   */
  fun ring(c: Context, id: String) {
    val alarm = get(c, id) ?: return
    prefs(c).edit().remove(id).apply()
    val base = id.removeSuffix(SNOOZE)
    rung(c).edit().clear().putString(base, alarm.toJson()).apply()
    ensureChannel(c, alarm.channel)
    val full = Intent(c, AlarmActivity::class.java).setData(Uri.parse("zakialarm://ring/" + Uri.encode(base)))
      .putExtra(EXTRA_ID, base)
      .putExtra("alarm", alarm.toJson())
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
    val fullPi = PendingIntent.getActivity(c, base.hashCode(), full, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun action(act: String) = PendingIntent.getBroadcast(
      c, (act + base).hashCode(),
      Intent(c, AlarmReceiver::class.java).setAction(act).setData(Uri.parse("zakialarm://" + act + "/" + Uri.encode(base))).putExtra(EXTRA_ID, base),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    @Suppress("DEPRECATION")
    val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(c, RING_CHANNEL).setTimeoutAfter(RING_FOR_MS)
    else Notification.Builder(c).setPriority(Notification.PRIORITY_MAX).setDefaults(Notification.DEFAULT_VIBRATE)
      .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), android.media.AudioManager.STREAM_ALARM)
    @Suppress("DEPRECATION")
    val n = b
      .setSmallIcon(c.applicationInfo.icon)
      .setContentTitle(alarm.title)
      .setContentText(alarm.body)
      .setStyle(Notification.BigTextStyle().bigText(alarm.body))
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(fullPi)
      .setFullScreenIntent(fullPi, true)
      .addAction(Notification.Action.Builder(null, alarm.snooze, action(ACTION_SNOOZE)).build())
      .addAction(Notification.Action.Builder(null, alarm.stop, action(ACTION_STOP)).build())
      .build()
    n.flags = n.flags or Notification.FLAG_INSISTENT
    try {
      (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(notificationId(base), n)
    } catch (_: SecurityException) {
      // Notifications turned off for the app: nothing can ring.
    }
  }
}
