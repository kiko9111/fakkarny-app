import { Image, View } from "react-native";
import type { ThemeId } from "./themes";
import { palette, themeId } from "./tokens";

const ART: Record<ThemeId, { happy: number; calm: number }> = {
  sunrise: { happy: require("../../assets/zaki/zaki-sunrise-happy.png"), calm: require("../../assets/zaki/zaki-sunrise-calm.png") },
  mint: { happy: require("../../assets/zaki/zaki-mint-happy.png"), calm: require("../../assets/zaki/zaki-mint-calm.png") },
  cloud: { happy: require("../../assets/zaki/zaki-cloud-happy.png"), calm: require("../../assets/zaki/zaki-cloud-calm.png") },
};

/**
 * Zaki: the liquid-glass spark smile from the app icon, in the user's theme (or `theme`).
 * `mood` "calm" closes the eye into a soft curve. The art is rendered from the same SVG as the
 * icon (assets/zaki, 320 px), so it stays crisp up to about 100 pt.
 */
export function ZakiAvatar({ size = 40, glow = false, mood = "happy", theme }: { size?: number; glow?: boolean; mood?: "happy" | "calm"; theme?: ThemeId }) {
  const id = theme ?? themeId;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityLabel="Zaki" accessible>
      {glow ? <View style={{ position: "absolute", width: size * 0.9, height: size * 0.9, borderRadius: size * 0.3, backgroundColor: palette.primary, boxShadow: `0px ${Math.round(size * 0.12)}px ${Math.round(size * 0.4)}px ${palette.primary}66`, opacity: 0.9 }} /> : null}
      <Image source={ART[id][mood]} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
    </View>
  );
}
