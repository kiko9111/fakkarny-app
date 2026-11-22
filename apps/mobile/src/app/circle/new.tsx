import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { t } from "@/i18n";
import { createCircle } from "@/lib/api";
import { colors } from "@/lib/theme";

/** Name a new circle; it opens straight away so the next tap is "invite". */
export default function NewCircleScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = params.kind === "friends" ? "friends" : "family";
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = name.trim().length > 0;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const circle = await createCircle(kind, name.trim());
      router.replace({ pathname: "/circle/[id]", params: { id: circle.id } });
    } catch {
      Alert.alert(t.circles.failed);
      setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: kind === "family" ? t.circles.newTitleFamily : t.circles.newTitleFriends }} />
      <Text style={styles.emoji}>{kind === "family" ? "🏡" : "🤝"}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={kind === "family" ? t.circles.namePlaceholderFamily : t.circles.namePlaceholderFriends}
        maxLength={40}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <Pressable style={[styles.primary, (!ready || busy) && styles.dim]} disabled={!ready || busy} onPress={() => void submit()} accessibilityRole="button">
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t.circles.create}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, padding: 24, gap: 14 },
  emoji: { fontSize: 48, textAlign: "center", marginTop: 12 },
  input: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: colors.text, writingDirection: "auto" },
  primary: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  dim: { opacity: 0.5 },
});
