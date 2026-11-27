import { useCallback, useLayoutEffect, useState } from "react";
import { router, useNavigation } from "expo-router";
import type { Circle } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t } from "@/i18n";
import { listCircles, peekCircles } from "@/lib/api";
import { failText } from "@/lib/errors";
import { useLive } from "@/lib/live";
import { Button, IconTile, IntroPanel, ListRow, LoadingCards, Note, palette, Screen, useAddSheet } from "@/ui";

const newCircle = () => router.push("/circle/new");

/** People: the user's circles. The header "+" makes one or takes an invite code. */
export default function CirclesScreen() {
  const [circles, setCircles] = useState<Circle[] | null>(() => peekCircles());
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    // What the phone holds first (the same object when nothing changed: no redraw), then the server.
    const held = peekCircles();
    if (held) setCircles(held);
    try {
      setCircles(await listCircles());
      setFailed(null);
    } catch (err) {
      setFailed(failText(err, t.circles.offline));
    }
  }, []);

  // Reload whenever the tab comes back into view (after creating, joining or leaving).
  useLive(load);

  const add = useAddSheet([
    { key: "new", icon: "people-outline", label: t.circles.newTitle, onPress: newCircle },
    { key: "code", icon: "key-outline", label: t.ui.haveCode, onPress: () => router.push("/invite") },
  ]);
  const navigation = useNavigation();
  useLayoutEffect(() => navigation.setOptions(add.header), [navigation, add.header]);

  return (
    <Screen onRefresh={load}>
      {failed && circles === null ? (
        <>
          <Note icon="cloud-offline-outline">{failed}</Note>
          <Button label={t.lay.common.tryAgain} kind="text" size="sm" onPress={() => void load()} />
        </>
      ) : null}
      {circles === null && !failed ? <LoadingCards count={2} /> : null}
      {(circles ?? []).map((c) => (
        <ListRow
          key={c.id}
          leading={<IconTile name={c.kind === "family" ? "home" : "people"} color={c.kind === "family" ? palette.family : palette.friends} bg={c.kind === "family" ? palette.familySoft : palette.friendsSoft} />}
          title={c.name}
          meta={fill(t.ui.members, { n: c.member_count })}
          onPress={() => router.push({ pathname: "/circle/[id]", params: { id: c.id } })}
        />
      ))}
      {circles !== null && circles.length === 0 ? <IntroPanel title={t.lay.tabs.peopleEmpty} action={t.circles.newTitle} onAction={newCircle} /> : null}
      {add.sheet}
    </Screen>
  );
}
