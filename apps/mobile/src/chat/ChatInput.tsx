import { useState } from "react";
import { Platform, StyleSheet, TextInput, View } from "react-native";
import { t } from "@/i18n";
import { glass, fonts, IconButton, palette, radius, shadow, space, textStart } from "@/ui";

/** Text only (CLAUDE.md). Users can dictate with the keyboard microphone. */
export function ChatInput({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const canSend = text.trim().length > 0;
  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setText("");
  };

  return (
    <View style={styles.bar}>
      <View style={styles.field}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t.chat.placeholder}
          placeholderTextColor={palette.inkFaint}
          multiline
          maxLength={4000}
          textAlign={textStart}
          accessibilityLabel={t.chat.placeholder}
          // The browser preview: Enter sends, Shift+Enter makes a new line.
          onKeyPress={
            Platform.OS === "web"
              ? (e) => {
                  const ev = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
                  if (ev.key === "Enter" && !ev.shiftKey) {
                    (e as unknown as { preventDefault: () => void }).preventDefault();
                    submit();
                  }
                }
              : undefined
          }
        />
        <IconButton name="arrow-up" label={t.chat.send} onPress={submit} disabled={!canSend} color={palette.onPrimary} bg={canSend ? palette.primary : palette.lineStrong} size={40} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.md, backgroundColor: "transparent" },
  field: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, ...glass, backgroundColor: palette.surfaceStrong, borderRadius: radius.xl, paddingStart: space.lg, paddingEnd: space.xs + 2, paddingVertical: space.xs + 2 },
  input: { flex: 1, minHeight: 40, maxHeight: 140, paddingTop: 9, paddingBottom: 9, fontSize: 16, lineHeight: 22, fontFamily: fonts.body, color: palette.ink, outlineStyle: "none" } as object,
});
