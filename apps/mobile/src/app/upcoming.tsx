import { useCallback, useLayoutEffect, useState } from "react";
import type { Item } from "@fakkarni/shared";
import { router, useNavigation } from "expo-router";
import { listUpcoming } from "@/db/items";
import { t } from "@/i18n";
import { groupUpcoming } from "@/lib/group";
import { useItems } from "@/lib/useItems";
import { isLatePlan } from "@/today/glance";
import { PlanRow } from "@/today/PlanRow";
import { IntroPanel, notify, Rows, Screen, SectionHeader, useAddSheet } from "@/ui";

/**
 * Plans (FR-12 / F8): every plan, by day, for users who want to look. Requests from other people
 * wait in Today's "Needs you". The friend never sends this as a list unprompted. Each day is one
 * card of rows (design round 2); a ticked plan can be brought back for a moment.
 */
export default function UpcomingScreen() {
  // Plans come from SQLite a moment after the first draw: until then "nothing planned" is not known.
  const [read, setRead] = useState(false);
  const load = useCallback(async () => {
    const rows = await listUpcoming();
    setRead(true);
    return rows;
  }, []);
  const { items, refresh, complete, reopen } = useItems(load);
  const now = new Date();
  const groups = groupUpcoming(items, now);
  const done = (i: Item) => () => {
    void complete(i.id).catch(() => {});
    notify(t.lay.today.planDone, "ok", { label: t.lay.common.undo, onPress: () => void reopen(i) });
  };
  // This screen sits above the tabs: go back down to the chat (a plain navigate would stack a
  // second copy of the tabs on top), where the composer starts the reminder.
  const remind = () => router.dismissTo({ pathname: "/", params: { compose: "remind" } });
  const add = useAddSheet([{ key: "remind", icon: "notifications-outline", kind: "alarm", label: t.lay.today.addRemind, onPress: remind }]);
  const navigation = useNavigation();
  useLayoutEffect(() => navigation.setOptions({ title: t.lay.common.plans, ...add.header }), [navigation, add.header]);

  return (
    <Screen onRefresh={refresh}>
      {read && groups.length === 0 ? <IntroPanel title={t.lay.today.noPlans} action={t.lay.today.emptyAction} onAction={remind} say={t.lay.today.emptySay} /> : null}
      {groups.map((g) => [
        <SectionHeader key={g.bucket} title={t.upcoming[g.bucket]} />,
        <Rows key={`${g.bucket}:rows`}>
          {g.items.map((i) => (
            <PlanRow key={i.id} item={i} flat late={isLatePlan(i, now)} onDone={done(i)} />
          ))}
        </Rows>,
      ])}
    </Screen>
  );
}
