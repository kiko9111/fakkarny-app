import { Pressable, StyleSheet, View, type GestureResponderEvent } from "react-native";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { fonts, palette, shadow } from "./tokens";

/**
 * Zaki's chat, the front door: a larger, raised glossy button in the middle of the tab bar,
 * with the same chat icon as before.
 */
export function ChatTabButton({ onPress, onLongPress, focused, label }: { onPress?: ((e: GestureResponderEvent) => void) | null; onLongPress?: ((e: GestureResponderEvent) => void) | null; focused: boolean; label: string }) {
  return (
    <Pressable
      onPress={onPress ?? undefined}
      onLongPress={onLongPress ?? undefined}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      style={styles.slot}
      hitSlop={6}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.bubble, shadow.button, pressed && styles.pressed]}>
            <View pointerEvents="none" style={styles.gloss} />
            <Icon name={focused ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"} size={30} color={palette.onPrimary} />
          </View>
          <Text variant="caption" color={focused ? palette.primaryInk : palette.inkSoft} style={styles.label}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const SIZE = 62;
const styles = StyleSheet.create({
  slot: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 2 },
  bubble: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, marginTop: -26, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: palette.surfaceSolid, overflow: "hidden" },
  gloss: { position: "absolute", top: 0, left: 0, right: 0, height: "48%", backgroundColor: "rgba(255,255,255,0.18)", borderBottomLeftRadius: SIZE, borderBottomRightRadius: SIZE },
  pressed: { transform: [{ scale: 0.95 }] },
  label: { fontFamily: fonts.bodySemi, marginTop: 2 },
});
