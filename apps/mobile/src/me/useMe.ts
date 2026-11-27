import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import type { Item, PatchMeRequest, User } from "@fakkarni/shared";
import { currentAccountLabel } from "@/auth";
import { listAlarms } from "@/db/items";
import { t } from "@/i18n";
import { getMe, patchItem, patchMe, peekMe } from "@/lib/api";
import { failText } from "@/lib/errors";
import { prefs } from "@/lib/prefs";
import { saveItem } from "@/sync/save-item";
import { notify } from "@/ui";

/**
 * The profile behind Me and every /me page. Starts from the last profile seen on this phone
 * (`peekMe`), asks the server each time the page comes into view, and saves the way Me always
 * did: the change shows at once, the server catches up behind, a failed save puts it back.
 * `patchMe` writes its answer into the saved copy, so the next page opens with the change.
 *
 * `onFresh` gets each profile the server answers with: a page with text boxes fills them there
 * (not from `user`, so a save that failed leaves what was typed in the box).
 */
export function useMe(onFresh?: (user: User) => void) {
  const [user, setUser] = useState<User | null>(() => peekMe());
  const fresh = useRef(onFresh);
  fresh.current = onFresh;
  // The newest state, for saves started one after another before a redraw.
  const latest = useRef(user);
  latest.current = user;

  useFocusEffect(
    useCallback(() => {
      let here = true;
      // Another /me page may have saved since this one was last in view.
      const saved = peekMe();
      if (saved) setUser(saved);
      void getMe()
        .then((u) => {
          if (!here) return;
          setUser(u);
          prefs.set("always_direct", u.always_direct ? "1" : "0");
          fresh.current?.(u);
        })
        .catch(() => {});
      return () => {
        here = false;
      };
    }, []),
  );

  const save = useCallback(async (patch: PatchMeRequest) => {
    const before = latest.current;
    if (before) setUser({ ...before, ...patch } as User);
    try {
      setUser(await patchMe(patch));
    } catch (err) {
      setUser(before);
      notify(failText(err, t.saved.offline), "error");
    }
  }, []);

  return { user, save };
}

/** Who is signed in on this phone ("name@mail"), or null. Read when the page comes into view. */
export function useAccount() {
  const [account, setAccount] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      void currentAccountLabel().then(setAccount);
    }, []),
  );
  return [account, setAccount] as const;
}

/** The alarms on this phone (local SQLite), and Remove: gone at once, back if the save fails. */
export function useAlarms() {
  const [alarms, setAlarms] = useState<Item[]>([]);
  useFocusEffect(
    useCallback(() => {
      void listAlarms()
        .then(setAlarms)
        .catch(() => {});
    }, []),
  );
  const remove = useCallback(async (item: Item) => {
    setAlarms((list) => list.filter((i) => i.id !== item.id));
    try {
      const updated = await patchItem(item.id, { alarm: false });
      await saveItem(updated);
    } catch (err) {
      setAlarms((list) => [...list, item]);
      notify(failText(err, t.saved.offline), "error");
    }
  }, []);
  return { alarms, remove };
}
