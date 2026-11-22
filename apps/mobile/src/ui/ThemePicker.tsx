import { Pressable, StyleSheet, View } from "react-native";
import { t } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { reloadApp } from "@/lib/reload";
import { Text } from "./Text";
import { THEME_IDS, THEMES, type ThemeId } from "./themes";
import { palette, radius, space, themeId } from "./tokens";
import { ZakiAvatar } from "./Zaki";

const NAME: Record<ThemeId, string> = { sunrise: t.ui.themeSunrise, mint: t.ui.themeMint, cloud: t.ui.themeCloud };

/** Three soft themes, each shown as Zaki in that colour. Picking one reloads the app in it. */
export function ThemePicker() {
  const pick = (id: ThemeId) => {
    if (id === themeId) return;
    prefs.set("theme", id);
    void reloadApp();
  };
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {THEME_IDS.map((id) => {
        const on = id === themeId;
        const th = THEMES[id];
        return (
          <Pressable
            key={id}
            onPress={() => pick(id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={NAME[id]}
            style={({ pressed }) => [styles.tile, { backgroundColor: th.bg + "B3", borderColor: on ? th.primary : palette.glassEdge }, pressed && styles.pressed]}
          >
            <ZakiAvatar size={44} theme={id} />
            <Text variant="smallStrong" color={on ? th.primaryInk : palette.inkSoft} align="center">
              {NAME[id]}
            </Text>
            <View style={[styles.dot, { backgroundColor: on ? th.primary : "transparent", borderColor: on ? th.primary : palette.lineStrong }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm },
  tile: { flex: 1, alignItems: "center", gap: space.xs, paddingVertical: space.md, borderRadius: radius.lg, borderWidth: 2 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginTop: 2 },
  pressed: { opacity: 0.8 },
});
