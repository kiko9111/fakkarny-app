import { router, Stack } from "expo-router";
import { t } from "@/i18n";
import { NavRow, palette, RowGroup, Screen, Text } from "@/ui";

/** What Zaki remembers: the door to the memories list, and one line on what is kept. */
export default function MemoryScreen() {
  const m = t.lay.me;
  return (
    <Screen>
      <Stack.Screen options={{ title: m.memory }} />
      <RowGroup>
        <NavRow icon="bulb-outline" kind="alarm" title={m.memoryRow} onPress={() => router.push("/memories")} />
      </RowGroup>
      <Text variant="caption" color={palette.inkSoft} align="center">
        {m.memoryLine}
      </Text>
    </Screen>
  );
}
