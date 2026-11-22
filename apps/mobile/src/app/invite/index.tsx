import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, Stack } from "expo-router";
import { inviteCodeFromText } from "@fakkarni/shared";
import { t } from "@/i18n";
import { colors } from "@/lib/theme";

/** "I have an invite": paste the WhatsApp link or type the code from the web page. */
export default function EnterInviteScreen() {
  const [text, setText] = useState("");
  const code = inviteCodeFromText(text);

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: t.circles.codeTitle }} />
      <Text style={styles.hint}>{t.circles.codeHint}</Text>
      <TextInput style={styles.input} value={text} onChangeText={setText} placeholder={t.circles.codePlaceholder} autoCapitalize="characters" autoCorrect={false} autoFocus textAlign="center" />
      <Pressable style={[styles.primary, !code && styles.dim]} disabled={!code} onPress={() => code && router.replace({ pathname: "/invite/[code]", params: { code } })} accessibilityRole="button">
        <Text style={styles.primaryText}>{t.circles.next}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, padding: 24, gap: 14 },
  hint: { color: colors.muted, fontSize: 15, textAlign: "center" },
  input: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: colors.text },
  primary: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  dim: { opacity: 0.5 },
});
