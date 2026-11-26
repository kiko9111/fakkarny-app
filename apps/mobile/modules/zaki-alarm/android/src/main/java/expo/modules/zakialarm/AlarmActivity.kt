package expo.modules.zakialarm

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.lang.ref.WeakReference
import java.text.DateFormat
import java.util.Date

/**
 * The alarm over the lock screen: the time, Zaki's words, Snooze and Stop. Built in code (no layout
 * resources) and themed with the app's Sunrise colours. Stop or Snooze silences the notification's
 * sound; leaving without either leaves it ringing until it times out.
 */
class AlarmActivity : Activity() {
  private var id: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= 27) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    show()
  }

  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    show()
  }

  override fun onDestroy() {
    if (current?.get() === this) current = null
    super.onDestroy()
  }

  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

  private fun pill(label: String, fill: Int, ink: Int, onTap: () -> Unit) = Button(this).apply {
    text = label
    isAllCaps = false
    textSize = 20f
    setTextColor(ink)
    background = GradientDrawable().apply { cornerRadius = dp(32).toFloat(); setColor(fill) }
    setPadding(dp(24), dp(16), dp(24), dp(16))
    setOnClickListener { onTap() }
    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(14) }
  }

  private fun show() {
    val alarm = intent.getStringExtra("alarm")?.let(Alarm::fromJson)
    val alarmId = intent.getStringExtra(Alarms.EXTRA_ID)
    if (alarm == null || alarmId == null) return finish()
    id = alarmId
    current = WeakReference(this)
    val ink = Color.parseColor("#3A2A22")
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      layoutDirection = View.LAYOUT_DIRECTION_LOCALE
      setPadding(dp(28), dp(48), dp(28), dp(48))
      background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.parseColor("#FFD7C2"), Color.parseColor("#FFF8F2")))
    }
    root.addView(TextView(this).apply {
      text = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date())
      textSize = 64f
      setTextColor(ink)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
    })
    root.addView(TextView(this).apply {
      text = alarm.title
      textSize = 18f
      setTextColor(Color.parseColor("#8A6A5A"))
      gravity = Gravity.CENTER
      setPadding(0, dp(8), 0, 0)
    })
    root.addView(TextView(this).apply {
      text = alarm.body
      textSize = 26f
      setTextColor(ink)
      gravity = Gravity.CENTER
      setPadding(0, dp(16), 0, dp(40))
    })
    root.addView(pill(alarm.stop, Color.parseColor("#FF7A59"), Color.WHITE) {
      Alarms.stopRinging(this, alarmId)
      finish()
    })
    root.addView(pill(alarm.snooze, Color.WHITE, ink) {
      Alarms.snooze(this, alarmId)
      finish()
    })
    root.addView(pill(alarm.open, Color.TRANSPARENT, Color.parseColor("#C2553A")) {
      Alarms.stopRinging(this, alarmId)
      val open = Alarms.openAppIntent(this)
      val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
      if (open != null && Build.VERSION.SDK_INT >= 26 && km.isKeyguardLocked) {
        // Unlock first (PIN / fingerprint), then open the app; this screen stays until that is answered.
        km.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
          override fun onDismissSucceeded() {
            try { open.send() } catch (_: Exception) {}
            finish()
          }
          override fun onDismissCancelled() = finish()
          override fun onDismissError() = finish()
        })
      } else {
        try { open?.send() } catch (_: Exception) {}
        finish()
      }
    })
    setContentView(root)
  }

  companion object {
    private var current: WeakReference<AlarmActivity>? = null

    /** Stop came from the notification or the app: the screen goes too. */
    fun close(id: String) {
      val a = current?.get() ?: return
      if (a.id == id) a.runOnUiThread { a.finish() }
    }
  }
}
