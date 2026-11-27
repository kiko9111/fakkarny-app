import { StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { usePocketMoney } from "@/homework/PocketMoney";
import { t } from "@/i18n";
import { Screen, space } from "@/ui";

/** Pocket money from homework, every circle's records (the body is src/homework/PocketMoney.tsx). */
export default function PocketMoneyScreen() {
  const pocket = usePocketMoney();
  return (
    <Screen onRefresh={pocket.load} contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.homework.pocketTitle }} />
      {pocket.view}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
});
