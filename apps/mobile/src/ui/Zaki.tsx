import { View } from "react-native";
import { palette } from "./tokens";
import type { ThemeColors } from "./themes";

/**
 * Zaki: a soft, smiling little blob in the user's theme colour. Drawn with views (no image or
 * SVG module), so it stays sharp at any size and works in every build. `mood` changes the eyes.
 */
export function ZakiAvatar({ size = 40, glow = false, mood = "happy", colors }: { size?: number; glow?: boolean; mood?: "happy" | "calm"; colors?: Pick<ThemeColors, "zakiBody" | "zakiRim" | "zakiFace" | "zakiCheek"> }) {
  const c = colors ?? palette;
  const s = size;
  const eye = Math.max(3, Math.round(s * 0.1));
  const stroke = Math.max(1.5, s * 0.055);
  const blob = { borderTopLeftRadius: s * 0.5, borderTopRightRadius: s * 0.44, borderBottomRightRadius: s * 0.5, borderBottomLeftRadius: s * 0.46 };
  return (
    <View style={{ width: s, height: s, alignItems: "center", justifyContent: "center" }} accessibilityLabel="Zaki" accessible>
      {glow ? <View style={{ position: "absolute", width: s, height: s, ...blob, backgroundColor: c.zakiRim, opacity: 0.22, transform: [{ scale: 1.3 }] }} /> : null}
      <View style={{ width: s, height: s, ...blob, backgroundColor: c.zakiBody, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {/* Soft light from the top corner. */}
        <View style={{ position: "absolute", top: -s * 0.18, left: -s * 0.1, width: s * 0.75, height: s * 0.75, borderRadius: s, backgroundColor: "#FFFFFF", opacity: 0.28 }} />
        <View style={{ position: "absolute", bottom: -s * 0.25, right: -s * 0.2, width: s * 0.8, height: s * 0.8, borderRadius: s, backgroundColor: c.zakiRim, opacity: 0.55 }} />
        <View style={{ flexDirection: "row", gap: s * 0.2, marginTop: s * 0.02 }}>
          {[0, 1].map((i) =>
            mood === "calm" ? (
              <View key={i} style={{ width: eye * 1.6, height: eye * 0.8, borderBottomWidth: stroke, borderColor: c.zakiFace, borderBottomLeftRadius: eye, borderBottomRightRadius: eye }} />
            ) : (
              <View key={i} style={{ width: eye, height: eye * 1.25, borderRadius: eye, backgroundColor: c.zakiFace }} />
            ),
          )}
        </View>
        <View style={{ width: s * 0.34, height: s * 0.15, marginTop: s * 0.05, borderBottomWidth: stroke, borderColor: c.zakiFace, borderBottomLeftRadius: s * 0.2, borderBottomRightRadius: s * 0.2 }} />
        <View style={{ position: "absolute", flexDirection: "row", gap: s * 0.4, top: s * 0.52 }}>
          <View style={{ width: s * 0.13, height: s * 0.08, borderRadius: s, backgroundColor: c.zakiCheek, opacity: 0.55 }} />
          <View style={{ width: s * 0.13, height: s * 0.08, borderRadius: s, backgroundColor: c.zakiCheek, opacity: 0.55 }} />
        </View>
      </View>
    </View>
  );
}
