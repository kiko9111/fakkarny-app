package expo.modules.zakiwidget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * What the widget shows, as the app last wrote it (JSON from src/widget/data.ts), plus the Done taps
 * made on the widget that the app has not handled yet. Everything stays on the phone.
 */
object WidgetStore {
  private const val FILE = "zaki_widget"
  private const val DATA = "data"
  private const val DONE = "done"
  private const val HIDDEN = "hidden"
  /** A ticked row stays hidden this long even if the app has not written new data by then. */
  private const val HIDE_MS = 2L * 24 * 60 * 60 * 1000

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  fun data(ctx: Context): JSONObject? = prefs(ctx).getString(DATA, null)?.let {
    try {
      JSONObject(it)
    } catch (_: Exception) {
      null
    }
  }

  fun setData(ctx: Context, json: String) {
    prefs(ctx).edit().putString(DATA, json).apply()
  }

  /** Sign-out / account deleted: nothing of that person stays on the home screen. */
  @Synchronized
  fun clear(ctx: Context) {
    prefs(ctx).edit().clear().apply()
  }

  /** Row keys ticked on the widget ("p:<id>" for a plan, "d:<id>@<ms>" for one dose), still hidden. */
  @Synchronized
  fun hidden(ctx: Context, now: Long): Set<String> {
    val o = readObject(prefs(ctx).getString(HIDDEN, null))
    return o.keys().asSequence().filter { o.optLong(it) > now }.toSet()
  }

  /** A Done tap: hide the row at once and keep the tap for the app to answer (src/widget/index.ts). */
  @Synchronized
  fun markDone(ctx: Context, kind: String, id: String, at: Long, title: String, now: Long) {
    val p = prefs(ctx)
    val hidden = readObject(p.getString(HIDDEN, null))
    val keep = JSONObject()
    hidden.keys().forEach { k -> if (hidden.optLong(k) > now) keep.put(k, hidden.optLong(k)) }
    keep.put(if (kind == "dose") "d:$id@$at" else "p:$id", now + HIDE_MS)
    val queue = readArray(p.getString(DONE, null))
    queue.put(JSONObject().put("kind", kind).put("id", id).put("at", at).put("title", title).put("tapped", now))
    p.edit().putString(HIDDEN, keep.toString()).putString(DONE, queue.toString()).apply()
  }

  /** The Done taps waiting for the app, as a JSON array; they are handed over once. */
  @Synchronized
  fun takeDone(ctx: Context): String {
    val p = prefs(ctx)
    val queue = p.getString(DONE, null) ?: "[]"
    p.edit().remove(DONE).apply()
    return queue
  }

  private fun readObject(s: String?): JSONObject = try {
    if (s == null) JSONObject() else JSONObject(s)
  } catch (_: Exception) {
    JSONObject()
  }

  private fun readArray(s: String?): JSONArray = try {
    if (s == null) JSONArray() else JSONArray(s)
  } catch (_: Exception) {
    JSONArray()
  }
}
