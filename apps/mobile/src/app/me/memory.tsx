import { Redirect } from "expo-router";

/** What Zaki remembers is one list, at /memories: this address only leads there. */
export default function MemoryScreen() {
  return <Redirect href="/memories" />;
}
