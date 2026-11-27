package expo.modules.zakiwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.icu.text.DateFormat
import android.icu.util.Calendar
import android.icu.util.ULocale
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Zaki on the home screen (Android). Draws what the app last wrote (WidgetStore): what waits for an
 * answer, the next repeating reminder ("next dose"), the next plans with a Done button each, and two
 * ways into the chat. Rows whose time has passed drop out on every redraw, also with the app closed
 * (the system redraws every 30 minutes). A Done tap hides the row at once; the app closes the plan
 * the next time it runs (src/widget/index.ts).
 */
class ZakiWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
    for (id in ids) draw(ctx, mgr, id)
  }

  override fun onReceive(ctx: Context, intent: Intent) {
    if (intent.action == ACTION_DONE) {
      val id = intent.getStringExtra("id") ?: return
      WidgetStore.markDone(
        ctx,
        intent.getStringExtra("kind") ?: "plan",
        id,
        intent.getLongExtra("at", 0L),
        intent.getStringExtra("title") ?: "",
        System.currentTimeMillis(),
      )
      redrawAll(ctx)
      ZakiWidgetModule.live?.tellDone()
      return
    }
    super.onReceive(ctx, intent)
  }

  companion object {
    const val ACTION_DONE = "expo.modules.zakiwidget.DONE"
    /** A plan whose times all passed this long ago leaves the widget (Today's "still now" hour). */
    private const val STILL_NOW_MS = 60L * 60 * 1000

    fun redrawAll(ctx: Context) {
      val mgr = AppWidgetManager.getInstance(ctx)
      for (id in mgr.getAppWidgetIds(ComponentName(ctx, ZakiWidgetProvider::class.java))) draw(ctx, mgr, id)
    }

    private fun draw(ctx: Context, mgr: AppWidgetManager, widgetId: Int) {
      try {
        mgr.updateAppWidget(widgetId, build(ctx, widgetId))
      } catch (_: Exception) {
        // A widget that cannot draw keeps its last picture.
      }
    }

    private class Row(val kind: String, val id: String, val title: String, val at: Long?)

    private fun build(ctx: Context, widgetId: Int): RemoteViews {
      val data = WidgetStore.data(ctx)
      val rtl = data?.optBoolean("rtl") ?: false
      val v = RemoteViews(ctx.packageName, if (rtl) R.layout.zaki_widget_rtl else R.layout.zaki_widget_ltr)
      val now = System.currentTimeMillis()
      val words = data?.optJSONObject("words") ?: JSONObject()
      val accent = parseColor(data?.optString("accent"))

      v.setOnClickPendingIntent(R.id.zw_header, open(ctx, "today", widgetId, 0))
      v.setOnClickPendingIntent(R.id.zw_talk, open(ctx, "chat", widgetId, 1))
      v.setOnClickPendingIntent(R.id.zw_remind, open(ctx, "remind", widgetId, 2))
      v.setOnClickPendingIntent(R.id.zw_need, open(ctx, "today", widgetId, 3))
      words.optString("title").takeIf { it.isNotEmpty() }?.let { v.setTextViewText(R.id.zw_title, it) }
      words.optString("talk").takeIf { it.isNotEmpty() }?.let { v.setTextViewText(R.id.zw_talk, it) }
      words.optString("remind").takeIf { it.isNotEmpty() }?.let { v.setTextViewText(R.id.zw_remind, it) }

      val slots = listOf(
        Triple(R.id.zw_dose, R.id.zw_dose_time, R.id.zw_dose_title) to R.id.zw_dose_done,
        Triple(R.id.zw_p0, R.id.zw_p0_time, R.id.zw_p0_title) to R.id.zw_p0_done,
        Triple(R.id.zw_p1, R.id.zw_p1_time, R.id.zw_p1_title) to R.id.zw_p1_done,
        Triple(R.id.zw_p2, R.id.zw_p2_time, R.id.zw_p2_title) to R.id.zw_p2_done,
      )
      for ((ids, _) in slots) v.setViewVisibility(ids.first, View.GONE)
      v.setViewVisibility(R.id.zw_needs, View.GONE)
      v.setViewVisibility(R.id.zw_need, View.GONE)

      if (data == null) {
        v.setViewVisibility(R.id.zw_empty, View.VISIBLE)
        return v
      }

      // What waits for an answer: the count in the header, the oldest one on its own line.
      val needs = data.optJSONObject("needs")
      val count = needs?.optInt("count") ?: 0
      if (count > 0) {
        v.setTextViewText(R.id.zw_needs, words.optString("needs", "{n}").replace("{n}", count.toString()))
        v.setViewVisibility(R.id.zw_needs, View.VISIBLE)
        val first = needs?.optString("first").orEmpty()
        if (first.isNotEmpty()) {
          v.setTextViewText(R.id.zw_need, first)
          v.setViewVisibility(R.id.zw_need, View.VISIBLE)
        }
      }

      val hidden = WidgetStore.hidden(ctx, now)
      val locale = ULocale.forLanguageTag(data.optString("locale", "en"))

      // The next repeating reminder (medicine, water, prayers): the soonest occurrence still ahead.
      var dose: Row? = null
      val doses = data.optJSONArray("doses")
      if (doses != null) {
        for (i in 0 until doses.length()) {
          val d = doses.optJSONObject(i) ?: continue
          val id = d.optString("id")
          val times = d.optJSONArray("times") ?: continue
          for (j in 0 until times.length()) {
            val t = times.optLong(j)
            if (t < now - 10 * 60 * 1000 || "d:$id@$t" in hidden) continue
            if (dose == null || t < (dose.at ?: Long.MAX_VALUE)) dose = Row("dose", id, d.optString("title"), t)
            break
          }
        }
      }

      val plans = mutableListOf<Row>()
      val list = data.optJSONArray("plans")
      if (list != null) {
        for (i in 0 until list.length()) {
          val p = list.optJSONObject(i) ?: continue
          val id = p.optString("id")
          if ("p:$id" in hidden) continue
          val until = if (p.isNull("until")) null else p.optLong("until")
          if (until != null && until < now) continue
          val at = if (p.isNull("at")) null else p.optLong("at")
          plans.add(Row("plan", id, p.optString("title"), at))
          if (plans.size == 3) break
        }
      }

      val rows = listOfNotNull(dose) + plans
      v.setViewVisibility(R.id.zw_empty, if (rows.isEmpty()) View.VISIBLE else View.GONE)
      if (rows.isEmpty()) words.optString("empty").takeIf { it.isNotEmpty() }?.let { v.setTextViewText(R.id.zw_empty, it) }

      // The dose has its own slot; plans fill the other three.
      val filled = mutableListOf<Pair<Row, Int>>()
      dose?.let { filled.add(it to 0) }
      plans.forEachIndexed { i, p -> filled.add(p to i + 1) }
      for ((row, slot) in filled) {
        val (ids, done) = slots[slot]
        v.setViewVisibility(ids.first, View.VISIBLE)
        val time = row.at?.let { when_(it, now, locale, words) } ?: words.optString("anytime", "")
        val label = if (row.kind == "dose") listOf(words.optString("next"), time).filter { it.isNotEmpty() }.joinToString(" ") else time
        v.setTextViewText(ids.second, label)
        v.setViewVisibility(ids.second, if (label.isEmpty()) View.GONE else View.VISIBLE)
        accent?.let { c -> v.setTextColor(ids.second, c) }
        v.setTextViewText(ids.third, row.title)
        v.setOnClickPendingIntent(ids.first, open(ctx, "plans", widgetId, 4 + slot))
        v.setOnClickPendingIntent(done, doneIntent(ctx, row, widgetId, slot))
        v.setContentDescription(done, words.optString("done", "Done") + " " + row.title)
      }
      return v
    }

    /** "5:00 PM", "Tomorrow 9:00 AM", "Sat 8:00 PM", or the date further ahead. Latin digits in Arabic too. */
    private fun when_(at: Long, now: Long, locale: ULocale, words: JSONObject): String {
      val time = DateFormat.getInstanceForSkeleton("jmm", locale).format(java.util.Date(at))
      val days = dayIndex(at) - dayIndex(now)
      return when {
        days <= 0 -> time
        days == 1L -> listOf(words.optString("tomorrow"), time).filter { it.isNotEmpty() }.joinToString(" ")
        days < 7 -> DateFormat.getInstanceForSkeleton("EEE jmm", locale).format(java.util.Date(at))
        else -> DateFormat.getInstanceForSkeleton("MMMd", locale).format(java.util.Date(at))
      }
    }

    private fun dayIndex(ms: Long): Long {
      val c = Calendar.getInstance()
      c.timeInMillis = ms
      return c.get(Calendar.YEAR) * 400L + c.get(Calendar.DAY_OF_YEAR)
    }

    private fun parseColor(s: String?): Int? = try {
      if (s.isNullOrEmpty()) null else Color.parseColor(s)
    } catch (_: Exception) {
      null
    }

    /** Opens the app on a screen through fakkarni://widget/<where> (src/app/+native-intent.tsx). */
    private fun open(ctx: Context, where: String, widgetId: Int, slot: Int): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("fakkarni://widget/$where"))
        .setPackage(ctx.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      return PendingIntent.getActivity(ctx, widgetId * 32 + slot, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun doneIntent(ctx: Context, row: Row, widgetId: Int, slot: Int): PendingIntent {
      val intent = Intent(ctx, ZakiWidgetProvider::class.java)
        .setAction(ACTION_DONE)
        .putExtra("kind", row.kind)
        .putExtra("id", row.id)
        .putExtra("at", row.at ?: 0L)
        .putExtra("title", row.title)
      return PendingIntent.getBroadcast(ctx, widgetId * 32 + 16 + slot, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
  }
}
