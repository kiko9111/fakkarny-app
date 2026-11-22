import { ScrollView, StyleSheet } from "react-native";
import { Chip, space } from "@/ui";

export function QuickReplies({ options, onPick }: { options: readonly string[]; onPick: (text: string) => void }) {
  return (
    <ScrollView horizontal style={styles.scroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
      {options.map((o) => (
        <Chip key={o} label={o} onPress={() => onPick(o)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // A ScrollView grows by default; without this the chips take half the screen from the message list.
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.xs, alignItems: "center" },
});
