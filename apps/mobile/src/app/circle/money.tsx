import { useCallback, useEffect, useMemo, useState } from "react";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { MoneyOverview, Split } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { formatMoney } from "@/daftar/logic";
import { dateLocale, t } from "@/i18n";
import { getMoney, listSplits, peekMoney, peekSplits } from "@/lib/api";
import { failText } from "@/lib/errors";
import { dataChanged, useLive } from "@/lib/live";
import { circleBooks, circleSplits, splitLeft } from "@/tasks/jobs";
import { JobFailed, JobHeading } from "@/tasks/useCircleJob";
import { IconTile, IntroPanel, ListRow, LoadingCards, Screen, useAddSheet, type AddAction } from "@/ui";

/** A circle's money: its shared expense books with my share, and its group splits. Records only. */
export default function CircleMoneyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const words = t.lay.circlejobs;
  const [money, setMoney] = useState<MoneyOverview | null>(() => peekMoney());
  const [splits, setSplits] = useState<Split[] | null>(() => peekSplits());
  const [failed, setFailed] = useState<string | null>(null);
  // A book made or an amount added on this phone shows from the saved copy at once.
  useEffect(() => dataChanged.subscribe(() => setMoney((m) => peekMoney() ?? m)), []);

  // Each half loads on its own: a problem with splits never hides the books.
  const load = useCallback(async () => {
    const splitsDone = listSplits().then(setSplits, () => {});
    try {
      setMoney(await getMoney());
      setFailed(null);
    } catch (err) {
      setFailed(failText(err, t.book.offline));
    }
    await splitsDone;
  }, []);
  useLive(load);

  const actions = useMemo<AddAction[]>(
    () => [
      { key: "book", icon: "wallet-outline", kind: "money", label: words.addBook, onPress: () => router.push({ pathname: "/money/new", params: { circle: id } }) },
      // The split form picks its people from this circle when it reads `circle`.
      { key: "split", icon: "pie-chart-outline", kind: "place", label: words.addSplit, onPress: () => router.push({ pathname: "/split/new", params: { circle: id } }) },
    ],
    [id, words],
  );
  const add = useAddSheet(actions);

  const books = circleBooks(money?.sections ?? [], id);
  const bills = circleSplits(splits ?? [], id);
  const titled = books.length > 0 && bills.length > 0;
  const day = (iso: string) => new Date(iso).toLocaleDateString(dateLocale, { day: "numeric", month: "short" });
  const pounds = (n: number) => fill(t.ui.pounds, { n: formatMoney(n) });

  return (
    <>
      <Stack.Screen options={{ title: words.moneyTitle, ...add.header }} />
      <Screen onRefresh={load}>
        {money === null && splits === null ? (
          failed ? (
            <JobFailed text={failed} onRetry={() => void load()} />
          ) : (
            <LoadingCards />
          )
        ) : books.length + bills.length === 0 ? (
          <IntroPanel title={words.moneyEmpty} action={t.lay.common.add} onAction={add.open} />
        ) : (
          <>
            {titled ? <JobHeading title={words.books} /> : null}
            {books.map((s) => (
              <ListRow
                key={s.id}
                leading={<IconTile name="people" size={40} />}
                title={s.name}
                meta={`${pounds(s.month_total)} · ${fill(t.book.yourShare, { n: formatMoney(s.my_share) })}`}
                onPress={() => router.push({ pathname: "/money/[id]", params: { id: s.id } })}
              />
            ))}
            {titled ? <JobHeading title={words.splits} /> : null}
            {bills.map((s) => {
              const left = splitLeft(s);
              return (
                <ListRow
                  key={s.id}
                  leading={<IconTile name="restaurant-outline" size={40} />}
                  title={s.title || t.split.untitled}
                  meta={[day(s.created_at), pounds(s.total), left ? fill(t.split.leftToPay, { n: left }) : null, s.mine === false && s.owner_name ? fill(t.split.from, { name: s.owner_name }) : null].filter(Boolean).join(" · ")}
                  onPress={() => router.push({ pathname: "/split/[id]", params: { id: s.id } })}
                />
              );
            })}
          </>
        )}
      </Screen>
      {add.sheet}
    </>
  );
}
