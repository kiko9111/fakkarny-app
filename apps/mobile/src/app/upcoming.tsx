import { useCallback, useLayoutEffect, useState } from "react";
import { router, useNavigation } from "expo-router";
import { listUpcoming } from "@/db/items";
import { t } from "@/i18n";
import { groupUpcoming } from "@/lib/group";
import { useItems } from "@/lib/useItems";
import { PlanRow } from "@/today/PlanRow";
import { IntroPanel, Screen, SectionHeader } from "@/ui";

/**
 * Plans (FR-12 / F8): every plan, by day, for users who want to look. Requests from other people
 * wait in Today's "Needs you". The friend never sends this as a list unprompted.
 */
export default function UpcomingScreen() {
  // Plans come from SQLite a moment after the first draw: until then "nothing planned" is not known.
  const [read, setRead] = useState(false);
  const load = useCallback(async () => {
    const rows = await listUpcoming();
    setRead(true);
    return rows;
  }, []);
  const { items, refresh, complete } = useItems(load);
  const groups = groupUpcoming(items, new Date());
  const navigation = useNavigation();
  useLayoutEffect(() => navigation.setOptions({ title: t.lay.common.plans }), [navigation]);

  return (
    <Screen onRefresh={refresh}>
      {read && groups.length === 0 ? <IntroPanel title={t.lay.today.noPlans} action={t.lay.today.emptyAction} onAction={() => router.navigate({ pathname: "/", params: { compose: "remind" } })} say={t.lay.today.emptySay} /> : null}
      {groups.map((g) => [<SectionHeader key={g.bucket} title={t.upcoming[g.bucket]} />, ...g.items.map((i) => <PlanRow key={i.id} item={i} onDone={() => void complete(i.id).catch(() => {})} />)])}
    </Screen>
  );
}
