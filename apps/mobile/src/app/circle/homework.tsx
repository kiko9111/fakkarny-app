import { useMemo, useState } from "react";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { usePocketMoney } from "@/homework/PocketMoney";
import { dateLocale, t } from "@/i18n";
import { dayKind, homeworkSections } from "@/tasks/jobs";
import { TaskCard } from "@/tasks/TaskCard";
import { JobFailed, JobHeading, useCircleInvite, useCircleJob } from "@/tasks/useCircleJob";
import { IntroPanel, LoadingCards, NavRow, RowGroup, Screen, Segmented, useAddSheet, type AddAction } from "@/ui";

type View = "week" | "pocket";

/**
 * A family circle's homework. "This week": what waits for the parent's review, then the open
 * homework by the day it is due (a child sees their own, with hand-in and "Check with Zaki" on
 * each card), then the last finished. "Pocket money": this circle's records.
 */
export default function CircleHomeworkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { circle, tasks, failed, load } = useCircleJob(id);
  const { invite } = useCircleInvite(id);
  const words = t.lay.circlejobs;
  const [view, setView] = useState<View>("week");
  const pocket = usePocketMoney({ circleId: id, empty: <IntroPanel title={words.pocketEmpty} /> });

  // Alone in the circle there is no child to send homework to yet: the "+" invites instead.
  const alone = circle !== null && circle.members.length < 2;
  const actions = useMemo<AddAction[]>(
    () =>
      alone
        ? [{ key: "invite", icon: "logo-whatsapp", kind: "people", label: words.invite, onPress: invite }]
        : [
            { key: "week", icon: "school-outline", label: words.addWeek, onPress: () => router.push({ pathname: "/homework/plan", params: { circle: id } }) },
            // The new-task form starts as homework when it reads `homework=1`.
            { key: "one", icon: "create-outline", label: words.addOne, onPress: () => router.push({ pathname: "/task/new", params: { circle: id, homework: "1" } }) },
          ],
    [alone, id, invite, words],
  );
  const add = useAddSheet(actions);

  const now = new Date();
  const { review, days, done } = homeworkSections(tasks ?? [], now);
  const empty = review.length + days.length + done.length === 0;
  // A child hands homework in; explaining a lesson is the parent's help.
  const child = circle?.members.find((m) => m.is_me)?.family_role === "teen";
  // An open homework card the parent set already carries "Explain the lesson": one home for it.
  const cardsExplain = days.some((d) => d.tasks.some((task) => task.role === "assigner"));
  const reload = () => void load();
  const dayTitle = (key: string) => {
    if (key === "late") return words.late;
    if (key === "none") return words.noDay;
    const kind = dayKind(key, now);
    if (kind === "today") return t.lay.common.today;
    if (kind === "tomorrow") return words.tomorrow;
    return new Date(`${key}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "short" });
  };

  return (
    <>
      <Stack.Screen options={{ title: words.homeworkTitle, ...add.header }} />
      <Screen onRefresh={view === "week" ? load : pocket.load}>
        <Segmented
          options={[
            { key: "week", label: words.week },
            { key: "pocket", label: words.pocket },
          ]}
          value={view}
          onChange={setView}
        />
        {view === "pocket" ? (
          pocket.view
        ) : tasks === null ? (
          failed ? (
            <JobFailed text={failed} onRetry={reload} />
          ) : (
            <LoadingCards />
          )
        ) : (
          <>
            {empty ? (
              alone ? (
                <IntroPanel title={words.homeworkAlone} action={words.invite} onAction={invite} />
              ) : (
                <IntroPanel title={words.homeworkEmpty} action={t.lay.common.add} onAction={add.open} say={words.homeworkSay} />
              )
            ) : null}
            {review.length ? <JobHeading title={words.toReview} /> : null}
            {review.map((task) => (
              <TaskCard key={task.id} task={task} onChanged={reload} />
            ))}
            {days.map((day) => [
              <JobHeading key={day.key} title={dayTitle(day.key)} />,
              ...day.tasks.map((task) => <TaskCard key={task.id} task={task} onChanged={reload} />),
            ])}
            {done.length ? <JobHeading title={words.done} /> : null}
            {done.map((task) => (
              <TaskCard key={task.id} task={task} onChanged={reload} />
            ))}
            {!alone && !child && !cardsExplain ? (
              <RowGroup>
                <NavRow icon="color-wand-outline" title={words.explain} onPress={() => router.push("/homework/help")} />
              </RowGroup>
            ) : null}
          </>
        )}
      </Screen>
      {add.sheet}
    </>
  );
}
