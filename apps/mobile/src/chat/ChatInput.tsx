import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { t } from "@/i18n";
import { colors } from "@/lib/theme";

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
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={t.chat.placeholder}
        placeholderTextColor={colors.muted}
        multiline
        maxLength={4000}
        textAlign="start"
      />
      <Pressable
        onPress={submit}
        disabled={!canSend}
        style={[styles.send, !canSend && styles.sendDisabled]}
        accessibilityRole="button"
        accessibilityLabel={t.chat.send}
      >
        <Text style={styles.sendText}>{t.chat.send}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5DDD5",
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    color: colors.text,
  },
  send: { backgroundColor: colors.accent, borderRadius: 20, paddingHorizontal: 16, height: 40, justifyContent: "center" },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: "#fff", fontWeight: "600" },
});
