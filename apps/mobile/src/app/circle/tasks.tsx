import { useMemo } from "react";
import { sortLinkTasks } from "@/tasks/logic";
import { LinkTaskCard } from "@/tasks/LinkTaskCard";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { t } from "@/i18n";
import { taskSections } from "@/tasks/jobs";
import { TaskCard } from "@/tasks/TaskCard";
import { JobFailed, JobHeading, useCircleInvite, useCircleJob } from "@/tasks/useCircleJob";
import { IntroPanel, LoadingCards, Screen, useAddSheet, type AddAction } from "@/ui";

/** A circle's tasks (homework has its own screen): what waits for me, what is open, the last finished. */
export default function CircleTasksScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { circle, tasks, linkTasks, failed, load } = useCircleJob(id);
  const { invite } = useCircleInvite(id);
  const words = t.lay.circlejobs;

  // Alone in the circle there is nobody to ask yet: the "+" invites instead.
  const alone = circle !== null && circle.members.length < 2;
  const actions = useMemo<AddAction[]>(
    () => [
      alone
        ? { key: "invite", icon: "logo-whatsapp", kind: "people", label: words.invite, onPress: invite }
        : { key: "ask", icon: "checkmark-circle-outline", kind: "people", label: words.askSomeone, onPress: () => router.push({ pathname: "/task/new", params: { circle: id } }) },
      // Someone who is not on Zaki answers on a web page from a WhatsApp link.
      { key: "link", icon: "link-outline", kind: "people", label: words.sendLink, hint: words.sendLinkHint, onPress: () => router.push({ pathname: "/task/link", params: { circle: id } }) },
    ],
    [alone, id, invite, words],
  );
  const add = useAddSheet(actions);

  const { waiting, open, done } = taskSections(tasks ?? []);
  const byLink = sortLinkTasks(linkTasks ?? [], new Date());
  const empty = waiting.length + open.length + done.length + byLink.length === 0;
  // Titles only when there is more than one group to tell apart.
  const titled = [waiting, open, done, byLink].filter((g) => g.length).length > 1;
  const reload = () => void load();

  return (
    <>
      <Stack.Screen options={{ title: words.tasksTitle, ...add.header }} />
      <Screen onRefresh={load}>
        {tasks === null ? (
          failed ? (
            <JobFailed text={failed} onRetry={reload} />
          ) : (
            <LoadingCards />
          )
        ) : empty ? (
          alone ? (
            <IntroPanel title={words.tasksAlone} action={words.invite} onAction={invite} />
          ) : (
            <IntroPanel title={words.tasksEmpty} action={words.askSomeone} onAction={add.open} say={words.tasksSay} />
          )
        ) : (
          <>
            {titled && waiting.length ? <JobHeading title={t.lay.common.needsYou} /> : null}
            {waiting.map((task) => (
              <TaskCard key={task.id} task={task} onChanged={reload} />
            ))}
            {titled && open.length ? <JobHeading title={words.open} /> : null}
            {open.map((task) => (
              <TaskCard key={task.id} task={task} onChanged={reload} />
            ))}
            {titled && done.length ? <JobHeading title={words.done} /> : null}
            {done.map((task) => (
              <TaskCard key={task.id} task={task} onChanged={reload} />
            ))}
            {titled && byLink.length ? <JobHeading title={words.byLink} /> : null}
            {byLink.map((task) => (
              <LinkTaskCard key={task.id} task={task} onChanged={reload} />
            ))}
          </>
        )}
      </Screen>
      {add.sheet}
    </>
  );
}
