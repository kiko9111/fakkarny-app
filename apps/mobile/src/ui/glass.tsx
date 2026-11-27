import type { ReactNode } from "react";
import { Image, StyleSheet, View } from "react-native";
import type { ThemeId } from "./themes";
import { palette, themeId } from "./tokens";

const MESH: Record<ThemeId | "calm", number> = {
  sunrise: require("../../assets/bg/mesh-sunrise.jpg"),
  mint: require("../../assets/bg/mesh-mint.jpg"),
  cloud: require("../../assets/bg/mesh-cloud.jpg"),
  calm: require("../../assets/bg/mesh-calm.jpg"),
};

/**
 * The ground behind the whole app: a light mesh of the theme (a glow in the top corner, a blush
 * at the side, a paler glow below). It is a small image (assets/bg, drawn by scripts/make-meshes.mjs),
 * so it works in every build without a gradient or blur module.
 * `calm` is Session's own fixed ground, the same in every theme.
 */
export function Backdrop({ calm }: { calm?: boolean }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip, { backgroundColor: calm ? palette.calmGround : palette.ground }]} pointerEvents="none">
      <Image source={MESH[calm ? "calm" : themeId]} style={styles.fill} resizeMode="cover" accessibilityIgnoresInvertColors />
    </View>
  );
}

/**
 * Wraps every screen of a navigator (`screenLayout`) so each one carries its own mesh. Screens
 * that stay mounted underneath (other tabs, the screen a push came from) are then covered,
 * not seen through the glass.
 */
export function withGround({ children }: { children: ReactNode }) {
  return (
    <View style={styles.ground}>
      <Backdrop />
      {children}
    </View>
  );
}

/** The bar behind a header: the ground under a light veil of white, with a hairline lower edge. */
export const glassBar = "rgba(255,255,255,0.45)";
export function GlassHeader() {
  return (
    <View style={styles.bar}>
      <Backdrop />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: glassBar, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.glassEdge }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  ground: { flex: 1 },
  bar: { flex: 1, overflow: "hidden" },
  clip: { overflow: "hidden" },
  fill: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
});
