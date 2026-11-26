import { useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { Text } from "./Text";
import { fonts, palette, radius, shadow, space, textStart } from "./tokens";

/** A labelled text box used by every form. The box being typed in wears the theme's colour. */
export function TextField({ label, hint, big, style, onFocus, onBlur, ...rest }: TextInputProps & { label?: string; hint?: string; big?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="smallStrong" color={palette.inkSoft}>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={palette.inkFaint}
        textAlign={textStart}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, big && styles.big, focused && styles.focused, style]}
      />
      {hint ? (
        <Text variant="caption" color={palette.inkSoft}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs + 2 },
  // The browser's own focus ring is switched off: `focused` below is the sign on every platform.
  input: { minHeight: 52, backgroundColor: palette.surfaceStrong, borderRadius: radius.md, borderWidth: 1, borderColor: palette.glassEdge, paddingHorizontal: space.lg, fontSize: 17, fontFamily: fonts.body, color: palette.ink, outlineStyle: "none" } as object,
  big: { fontSize: 26, fontFamily: fonts.display, minHeight: 64 },
  focused: { borderColor: palette.primary, backgroundColor: palette.surfaceSolid, ...shadow.focus },
});
