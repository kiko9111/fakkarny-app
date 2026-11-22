import { StyleSheet, View } from "react-native";
import { palette } from "./tokens";

/**
 * Zaki's face: a warm little sun with a smile. Drawn with views (no image or SVG module), so it
 * stays sharp at any size and works in every build. `mood` only changes the eyes.
 */
export function ZakiAvatar({ size = 40, glow = false, mood = "happy" }: { size?: number; glow?: boolean; mood?: "happy" | "calm" }) {
  const s = size;
  const eye = Math.max(3, Math.round(s * 0.1));
  return (
    <View style={{ width: s, height: s, alignItems: "center", justifyContent: "center" }} accessibilityLabel="Zaki" accessible>
      {glow ? <View style={[StyleSheet.absoluteFill, { borderRadius: s, backgroundColor: palette.primary, opacity: 0.14, transform: [{ scale: 1.28 }] }]} /> : null}
      <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: "#F0A35E", borderWidth: Math.max(1.5, s * 0.06), borderColor: "#E07B3C", alignItems: "center", justifyContent: "center" }}>
        <View style={{ flexDirection: "row", gap: s * 0.2, marginTop: s * 0.04 }}>
          {[0, 1].map((i) =>
            mood === "calm" ? (
              <View key={i} style={{ width: eye * 1.6, height: eye * 0.8, borderBottomWidth: Math.max(1.5, s * 0.05), borderColor: palette.ink, borderBottomLeftRadius: eye, borderBottomRightRadius: eye }} />
            ) : (
              <View key={i} style={{ width: eye, height: eye * 1.25, borderRadius: eye, backgroundColor: palette.ink }} />
            ),
          )}
        </View>
        <View style={{ width: s * 0.38, height: s * 0.16, marginTop: s * 0.05, borderBottomWidth: Math.max(1.5, s * 0.055), borderColor: palette.ink, borderBottomLeftRadius: s * 0.2, borderBottomRightRadius: s * 0.2 }} />
        <View style={{ position: "absolute", flexDirection: "row", gap: s * 0.42, top: s * 0.54 }}>
          <View style={{ width: s * 0.12, height: s * 0.08, borderRadius: s, backgroundColor: "#E8805A", opacity: 0.6 }} />
          <View style={{ width: s * 0.12, height: s * 0.08, borderRadius: s, backgroundColor: "#E8805A", opacity: 0.6 }} />
        </View>
      </View>
    </View>
  );
}
