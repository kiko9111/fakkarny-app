import { router, Stack } from "expo-router";
import { t } from "@/i18n";
import { NavRow, RowGroup, Screen } from "@/ui";

/** What Zaki remembers: the door to the memories list. */
export default function MemoryScreen() {
  const m = t.lay.me;
  return (
    <Screen>
      <Stack.Screen options={{ title: m.memory }} />
      <RowGroup>
        <NavRow icon="bulb-outline" kind="alarm" title={m.memoryRow} onPress={() => router.push("/memories")} />
      </RowGroup>
    </Screen>
  );
}
