import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/theme";

export function Placeholder({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: "600", color: colors.text, textAlign: "center" },
  body: { fontSize: 16, color: colors.muted, textAlign: "center" },
});
