import { plain } from "./plain";
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";
import { minTouch, palette, radius, shadow, space } from "./tokens";

export type ButtonKind = "filled" | "tonal" | "outline" | "text" | "danger" | "whatsapp";

const look: Record<ButtonKind, { bg: string; fg: string; border?: string; pressed: string }> = {
  filled: { bg: palette.primary, fg: palette.onPrimary, pressed: palette.primaryPressed },
  tonal: { bg: palette.primarySoftGlass, fg: palette.primaryInk, border: palette.glassEdge, pressed: palette.primarySoft },
  outline: { bg: palette.surface, fg: palette.primaryInk, border: palette.glassEdge, pressed: palette.surfaceStrong },
  text: { bg: "transparent", fg: palette.primaryInk, pressed: palette.surfaceAlt },
  danger: { bg: "transparent", fg: palette.danger, pressed: palette.dangerSoft },
  whatsapp: { bg: palette.whatsapp, fg: "#FFFFFF", pressed: "#16733E" },
};

/** Pill buttons: filled (glossy, lit from the top) for the one main action, glass for the rest. */
export function Button({
  label,
  onPress,
  kind = "filled",
  icon,
  busy,
  disabled,
  size = "md",
  block,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const l = look[kind];
  const off = disabled || busy;
  const height = size === "lg" ? 56 : size === "sm" ? 40 : minTouch;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      hitSlop={size === "sm" ? 4 : 0}
      style={({ pressed }) => [
        styles.base,
        { minHeight: height, backgroundColor: pressed ? l.pressed : l.bg, paddingHorizontal: size === "sm" ? space.md : space.xl },
        l.border ? { borderWidth: 1, borderColor: l.border } : null,
        kind === "filled" || kind === "whatsapp" ? [shadow.button, styles.clip] : null,
        block ? styles.block : null,
        off ? styles.off : null,
        style,
      ]}
    >
      {kind === "filled" || kind === "whatsapp" ? <View pointerEvents="none" style={styles.gloss} /> : null}
      {busy ? (
        <ActivityIndicator color={l.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={size === "sm" ? 18 : 20} color={l.fg} /> : null}
          <Text variant={size === "sm" ? "smallStrong" : "label"} color={l.fg} align="center">
            {plain(label)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Round icon-only button (send, close, more). */
export function IconButton({ name, onPress, label, color = palette.inkSoft, bg, size = 44, disabled }: { name: IconName; onPress: () => void; label: string; color?: string; bg?: string; size?: number; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: bg ?? (pressed ? palette.surfaceAlt : "transparent") }, disabled && styles.off, pressed && bg ? { opacity: 0.85 } : null]}
    >
      <Icon name={name} size={Math.round(size * 0.5)} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  block: { alignSelf: "stretch" },
  clip: { overflow: "hidden" },
  // The light edge across the top of a filled button, as on the glass logo.
  gloss: { position: "absolute", top: 0, left: 0, right: 0, height: "50%", backgroundColor: "rgba(255,255,255,0.12)", borderBottomLeftRadius: 999, borderBottomRightRadius: 999 },
  off: { opacity: 0.45 },
});
