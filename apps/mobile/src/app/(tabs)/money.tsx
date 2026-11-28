import { clearParam } from "@/lib/clear-param";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import type { MoneySection } from "@fakkarni/shared";
import { partFirst, partFrom, spendTarget, type DaftarPart } from "@/daftar/layout";
import { PeopleView } from "@/daftar/PeopleView";
import { t } from "@/i18n";
import { peekMoney } from "@/lib/api";
import { photosAvailable } from "@/lib/photos";
import { SpendView } from "@/money/SpendView";
import { SplitsView } from "@/split/SplitsView";
import { AddSheet, Screen, Segmented, useAddSheet, type AddAction } from "@/ui";

// The part she left the Daftar on, kept while the app runs.
let lastPart: DaftarPart = "spend";

/**
 * The Daftar, "where is my money?": one switch (Spending / People / Splits) and one "+" whose
 * sheet is the same in every part. Each part loads and draws itself.
 */
export default function MoneyScreen() {
  const [part, setPartState] = useState<DaftarPart>(lastPart);
  const [reloadKey, setReloadKey] = useState(0);
  // "Money in or out" with a few sections: a short sheet asks which one.
  const [pick, setPick] = useState<MoneySection[] | null>(null);
  const setPart = (p: DaftarPart) => {
    lastPart = p;
    setPartState(p);
  };
  // A link to one part (Today's Daftar rows open People): shown on arrival, then the word is
  // used up, so the switch is hers again and the next arrival with it works too.
  const asked = partFrom(useLocalSearchParams<{ part?: string }>().part);
  useEffect(() => {
    if (!asked) return;
    setPart(asked);
    clearParam({ part: undefined });
  }, [asked]);

  const openSection = (id: string) => router.push({ pathname: "/money/[id]", params: { id } });
  // An amount is typed on a section's own screen, so this row leads to one (see `spendTarget`).
  const addMoney = () => {
    const to = spendTarget(peekMoney()?.sections);
    if (to.go === "new") router.push("/money/new");
    else if (to.go === "open") openSection(to.id);
    else if (to.go === "pick") setPick(to.sections);
    else setPart("spend");
  };

  // The open part's own action comes first; a new section is offered on Spending (elsewhere it is the last row of "Which section?").
  const actions: AddAction[] = partFirst<AddAction>([
    { key: "money", icon: "wallet-outline", kind: "money", label: t.lay.daftar.addMoney, onPress: addMoney },
    { key: "debt", icon: "swap-horizontal-outline", kind: "people", label: t.lay.daftar.addDebt, onPress: () => router.push("/daftar/new") },
    { key: "split", icon: "pie-chart-outline", kind: "place", label: t.lay.daftar.addSplit, onPress: () => router.push("/split/new") },
    { key: "gameya", icon: "sync-circle-outline", kind: "money", label: t.lay.gameya.add, onPress: () => router.push("/gameya/new") },
    // From Splits the receipt fills a new split; elsewhere its total goes into a section.
    ...(photosAvailable ? [{ key: "receipt", icon: "camera-outline" as const, kind: "money" as const, label: t.lay.daftar.addReceipt, onPress: () => (part === "split" ? router.push({ pathname: "/receipt", params: { for: "split" } }) : router.push("/receipt")) }] : []),
    ...(part === "spend" ? [{ key: "section", icon: "folder-open-outline" as const, kind: "neutral" as const, label: t.lay.daftar.addSection, onPress: () => router.push("/money/new") }] : []),
  ], part);
  const add = useAddSheet(actions);
  const navigation = useNavigation();
  useLayoutEffect(() => navigation.setOptions(add.header), [navigation, add.header]);

  const parts = useMemo(
    () => [
      { key: "spend" as const, label: t.lay.daftar.spending },
      { key: "people" as const, label: t.lay.daftar.people },
      { key: "split" as const, label: t.lay.daftar.splits },
    ],
    [],
  );

  return (
    <Screen onRefresh={() => setReloadKey((k) => k + 1)}>
      <Segmented options={parts} value={part} onChange={setPart} />
      {part === "spend" ? <SpendView reloadKey={reloadKey} /> : part === "split" ? <SplitsView reloadKey={reloadKey} /> : <PeopleView reloadKey={reloadKey} />}
      {add.sheet}
      <AddSheet
        visible={pick !== null}
        onClose={() => setPick(null)}
        title={t.lay.daftar.pickSection}
        actions={[
          ...(pick ?? []).map((s): AddAction => ({ key: s.id, icon: s.circle_id ? "people-outline" : s.kind === "income" ? "cash-outline" : "wallet-outline", kind: "money", label: s.name, onPress: () => openSection(s.id) })),
          { key: "new-section", icon: "folder-open-outline", kind: "neutral", label: t.lay.daftar.addSection, onPress: () => router.push("/money/new") },
        ]}
      />
    </Screen>
  );
}
