import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/theme";

export function ItemRow({ title, meta, action, onAction }: { title: string; meta?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable onPress={onAction} style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]} accessibilityRole="button">
          <Text style={styles.actionText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16, color: colors.text, textAlign: "left" },
  meta: { fontSize: 13, color: colors.muted, textAlign: "left" },
  action: { borderWidth: 1, borderColor: colors.accent, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  actionText: { color: colors.accent, fontWeight: "600" },
  section: { fontSize: 14, fontWeight: "700", color: colors.muted, marginTop: 8, textAlign: "left" },
});
