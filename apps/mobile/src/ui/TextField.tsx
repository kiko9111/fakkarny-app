import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { Text } from "./Text";
import { fonts, palette, radius, space, textStart } from "./tokens";

/** A labelled text box used by every form. */
export function TextField({ label, hint, big, style, ...rest }: TextInputProps & { label?: string; hint?: string; big?: boolean }) {
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="smallStrong" color={palette.inkSoft}>
          {label}
        </Text>
      ) : null}
      <TextInput placeholderTextColor={palette.inkFaint} textAlign={textStart} {...rest} style={[styles.input, big && styles.big, style]} />
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
  input: { minHeight: 52, backgroundColor: palette.surface, borderRadius: radius.md, borderWidth: 1, borderColor: palette.line, paddingHorizontal: space.lg, fontSize: 17, fontFamily: fonts.body, color: palette.ink },
  big: { fontSize: 26, fontFamily: fonts.display, minHeight: 64 },
});
