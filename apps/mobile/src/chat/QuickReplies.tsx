import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { colors } from "@/lib/theme";

export function QuickReplies({ options, onPick }: { options: readonly string[]; onPick: (text: string) => void }) {
  return (
    <ScrollView horizontal style={styles.scroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
      {options.map((o) => (
        <Pressable key={o} onPress={() => onPick(o)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
          <Text style={styles.text}>{o}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // A ScrollView grows by default; without this the chips take half the screen from the message list.
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { gap: 8, paddingHorizontal: 12, paddingVertical: 6, alignItems: "center" },
  chip: { borderWidth: 1, borderColor: colors.accent, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  pressed: { backgroundColor: "#FBE7DC" },
  text: { color: colors.accent, fontSize: 14 },
});
