import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { Placeholder } from "@/components/Placeholder";
import { language, t } from "@/i18n";
import { API_URL, getHealth } from "@/lib/api";
import { colors } from "@/lib/theme";

type Health = "checking" | "ok" | "down";

export default function SettingsScreen() {
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
    <Placeholder title={t.settings.title} body={`${t.settings.language}: ${language}\n\n${t.settings.aiDisclosure}`}>
      <Text style={[styles.health, { color: health === "ok" ? colors.ok : health === "down" ? colors.error : colors.muted }]}>
        ● {t.health[health]}
      </Text>
      <Text style={styles.small}>{API_URL}</Text>
    </Placeholder>
  );
}

const styles = StyleSheet.create({
  health: { fontSize: 14, fontWeight: "600" },
  small: { fontSize: 12, color: colors.muted },
});
