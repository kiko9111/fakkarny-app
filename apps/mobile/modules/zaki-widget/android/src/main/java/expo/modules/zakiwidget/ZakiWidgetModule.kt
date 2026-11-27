package expo.modules.zakiwidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The home-screen widget's bridge. JavaScript (src/widget) writes what to show after every change to
 * plans or to what waits for the user, and takes the Done taps made on the widget. Optional: builds
 * without this module skip all of it.
 */
class ZakiWidgetModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext) { "no context" }

  override fun definition() = ModuleDefinition {
    Name("ZakiWidget")

    /** Fired when Done was tapped on the widget while the app runs: call takeDone(). */
    Events("onDone")

    OnCreate { live = this@ZakiWidgetModule }

    OnDestroy { if (live === this@ZakiWidgetModule) live = null }

    /** What to show (JSON, src/widget/data.ts); every placed widget redraws. */
    Function("set") { json: String ->
      WidgetStore.setData(context, json)
      ZakiWidgetProvider.redrawAll(context)
      true
    }

    Function("clear") {
      WidgetStore.clear(context)
      ZakiWidgetProvider.redrawAll(context)
      true
    }

    /** Done taps not handled yet, as a JSON array of {kind, id, at, title, tapped}. */
    Function("takeDone") { WidgetStore.takeDone(context) }

    /**
     * Asks the launcher to put the widget on the home screen (Android 8+, launchers that allow it).
     * False: the user adds it by hand (long-press the home screen, Widgets, Zaki).
     */
    Function("pin") {
      val mgr = AppWidgetManager.getInstance(context)
      if (Build.VERSION.SDK_INT < 26 || !mgr.isRequestPinAppWidgetSupported) return@Function false
      mgr.requestPinAppWidget(ComponentName(context, ZakiWidgetProvider::class.java), null, null)
    }

    /** How many Zaki widgets are on the home screen. */
    Function("placed") {
      AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, ZakiWidgetProvider::class.java)).size
    }
  }

  fun tellDone() {
    try {
      sendEvent("onDone", mapOf<String, Any>())
    } catch (_: Exception) {
      // JavaScript is not listening: the tap waits in the store until the app takes it.
    }
  }

  companion object {
    @Volatile
    var live: ZakiWidgetModule? = null
  }
}
