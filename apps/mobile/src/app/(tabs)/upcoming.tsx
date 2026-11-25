import { useCallback, useState } from "react";
import { useLive } from "@/lib/live";
import type { CircleTask } from "@fakkarni/shared";
import { PlanRow } from "@/components/PlanRow";
import { listUpcoming } from "@/db/items";
import { t } from "@/i18n";
import { listTasks } from "@/lib/api";
import { groupUpcoming } from "@/lib/group";
import { useItems } from "@/lib/useItems";
import { TaskCard } from "@/tasks/TaskCard";
import { EmptyState, Screen, SectionHeader } from "@/ui";

/** FR-12 / F8: every plan, for users who want to look. The friend never sends this as a list unprompted. */
export default function UpcomingScreen() {
  const { items, refresh, complete } = useItems(listUpcoming);
  const groups = groupUpcoming(items, new Date());
  // Requests from circle members that wait for a yes or no. Online only; quiet when offline.
  const [asked, setAsked] = useState<CircleTask[]>([]);
  const loadAsked = useCallback(() => {
    listTasks()
      .then((all) => setAsked(all.filter((task) => task.status === "pending" && task.role === "assignee")))
      .catch(() => {});
  }, []);
  useLive(loadAsked);
  const reload = () => {
    loadAsked();
    return refresh();
  };

  return (
    <Screen onRefresh={reload}>
      {asked.length ? <SectionHeader title={t.tasks.toAnswer} /> : null}
      {asked.map((task) => (
        <TaskCard key={task.id} task={task} showCircle onChanged={reload} />
      ))}
      {groups.length === 0 && asked.length === 0 ? <EmptyState title={t.ui.noPlansTitle} body={t.upcoming.empty} /> : null}
      {groups.map((g) => [<SectionHeader key={g.bucket} title={t.upcoming[g.bucket]} />, ...g.items.map((i) => <PlanRow key={i.id} item={i} onDone={() => void complete(i.id).catch(() => {})} />)])}
    </Screen>
  );
}
