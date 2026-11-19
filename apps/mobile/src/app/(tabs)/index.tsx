import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { t } from "@/i18n";
import { API_URL, getHealth } from "@/lib/api";
import { colors } from "@/lib/theme";

type Health = "checking" | "ok" | "down";

/** Chat screen placeholder. M2 builds bubbles, typing indicator and the sync queue. */
export default function ChatScreen() {
  const [health, setHealth] = useState<Health>("checking");

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    getHealth(ctrl.signal)
      .then(() => setHealth("ok"))
      .catch(() => setHealth("down"))
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={styles.bubbleText}>{t.chat.greeting}</Text>
      </View>
      <Text style={styles.muted}>{t.chat.comingSoon}</Text>

      <View style={styles.footer}>
        <Text style={[styles.health, { color: health === "ok" ? colors.ok : health === "down" ? colors.error : colors.muted }]}>
          ● {t.health[health]}
        </Text>
        <Text style={styles.small}>{API_URL}</Text>
        <View style={styles.links}>
          <Link href="/onboarding" style={styles.link}>onboarding</Link>
          <Link href="/paywall" style={styles.link}>paywall</Link>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: colors.bg },
  bubble: { alignSelf: "flex-start", maxWidth: "85%", backgroundColor: colors.friendBubble, borderRadius: 18, padding: 12 },
  bubbleText: { fontSize: 16, color: colors.text, textAlign: "auto" },
  muted: { color: colors.muted },
  footer: { marginTop: "auto", alignItems: "center", gap: 4 },
  health: { fontSize: 14, fontWeight: "600" },
  small: { fontSize: 12, color: colors.muted },
  links: { flexDirection: "row", gap: 16, marginTop: 8 },
  link: { color: colors.accent, fontSize: 12 },
});
