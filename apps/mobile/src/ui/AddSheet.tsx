import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "@/i18n";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";
import { reduceMotion } from "./motion";
import { plain } from "./plain";
import { kind as kinds, palette, radius, shadow, space, type IconKind } from "./tokens";

/**
 * The one "+" of a screen (spec rule 4) and the sheet of what can be added there (rule 5). The
 * "+" sits at the header's trailing side, so it mirrors in Arabic by itself. Three lines a screen:
 *
 * A tab (the header belongs to the Tabs navigator):
 *   const add = useAddSheet([{ key: "plan", icon: "calendar-outline", label: t.lay.today.addPlan, onPress: () => router.push("/task/new") }]);
 *   const navigation = useNavigation();
 *   useLayoutEffect(() => navigation.setOptions(add.header), [navigation, add.header]);
 *   return <Screen>…{add.sheet}</Screen>;
 *
 * A pushed (stack) screen:
 *   const add = useAddSheet(actions);
 *   return <><Stack.Screen options={{ title, ...add.header }} /><Screen>…</Screen>{add.sheet}</>;
 *
 * With exactly one action the "+" runs it at once: a sheet of one row is a wasted tap.
 * Plain React Native (`Modal`, core `Animated`): no native module, so it reaches builds over the air.
 */

export interface AddAction {
  key: string;
  icon: IconName;
  /** What the row is about: colours its icon (tokens.ts `kind`). */
  kind?: IconKind;
  label: string;
  /** One short line under the label, when the label alone leaves a doubt. */
  hint?: string;
  onPress: () => void;
}

/** The round "+" for a header's trailing side. */
export function HeaderPlus({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={({ pressed }) => [styles.plus, pressed && styles.plusPressed]}>
      <Icon name="add" size={26} color={palette.primaryInk} />
    </Pressable>
  );
}

/**
 * A screen's "+" and its sheet. `header` goes to the navigator (see the examples above), `sheet`
 * goes anywhere in the screen's tree, `open` is for an empty state's one button.
 */
export function useAddSheet(actions: AddAction[], opts?: { title?: string; label?: string }): { header: { headerRight: () => ReactNode }; button: ReactNode; sheet: ReactNode; open: () => void } {
  const [visible, setVisible] = useState(false);
  // The header keeps one button for the screen's life; it reads the newest actions when tapped.
  const latest = useRef(actions);
  latest.current = actions;
  const open = useCallback(() => {
    const now = latest.current;
    if (now.length === 1) now[0]!.onPress();
    else if (now.length > 1) setVisible(true);
  }, []);
  const close = useCallback(() => setVisible(false), []);
  const label = opts?.label ?? t.lay.common.add;
  const button = useMemo(() => <HeaderPlus label={label} onPress={open} />, [label, open]);
  const header = useMemo(() => ({ headerRight: () => button }), [button]);
  const sheet = <AddSheet visible={visible} onClose={close} title={opts?.title} actions={actions} />;
  return { header, button, sheet, open };
}

// After a row is chosen the sheet goes first. iOS will not present a dialog or another sheet
// while this one is still leaving, so there the action waits for it.
const AFTER_CLOSE_MS = Platform.OS === "ios" ? 320 : 0;

/** A bottom sheet of rows. Choosing one closes the sheet, then runs it. */
export function AddSheet({ visible, onClose, title, actions }: { visible: boolean; onClose: () => void; title?: string; actions: AddAction[] }) {
  const bottom = useSafeAreaInsets().bottom;
  // Most sheets are 2-6 rows; a long one (every circle to pick from) scrolls inside the sheet
  // and its title stays on the screen.
  const rowsMax = Math.round(useWindowDimensions().height * 0.6);
  const lift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    lift.setValue(0);
    const run = Animated.timing(lift, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" });
    run.start();
    return () => run.stop();
  }, [visible, lift]);
  const choose = (a: AddAction) => {
    onClose();
    setTimeout(a.onPress, AFTER_CLOSE_MS);
  };
  // The Modal's own fade carries the scrim and the sheet in and out; the sheet also rises a
  // little as it arrives, unless the phone asks for less motion.
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.fill}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityRole="button" accessibilityLabel={t.lay.common.close} />
        <Animated.View style={[styles.sheet, { paddingBottom: Math.max(bottom, space.lg) + space.sm, transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion() ? 0 : 28, 0] }) }] }]} accessibilityViewIsModal>
          <View style={styles.grip} />
          <Text variant="headline" style={styles.title} accessibilityRole="header">
            {plain(title ?? t.lay.common.add)}
          </Text>
          <ScrollView style={{ maxHeight: rowsMax }} bounces={false} showsVerticalScrollIndicator={false}>
          {actions.map((a, i) => (
            <Pressable key={a.key} onPress={() => choose(a)} accessibilityRole="button" accessibilityLabel={a.hint ? `${plain(a.label)}, ${a.hint}` : plain(a.label)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
              <View style={[styles.icon, { backgroundColor: kinds[a.kind ?? "primary"].bg }]}>
                <Icon name={a.icon} size={20} color={kinds[a.kind ?? "primary"].ink} />
              </View>
              <View style={[styles.rowBody, i > 0 && styles.hairline]}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {plain(a.label)}
                </Text>
                {a.hint ? (
                  <Text variant="small" color={palette.inkSoft} numberOfLines={2}>
                    {a.hint}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  plus: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginHorizontal: space.md, backgroundColor: palette.surfaceStrong, ...shadow.card },
  plusPressed: { backgroundColor: palette.primarySoft },
  fill: { flex: 1, justifyContent: "flex-end" },
  scrim: { backgroundColor: palette.scrim },
  sheet: { alignSelf: "center", width: "100%", maxWidth: 560, backgroundColor: palette.surfaceSolid, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: space.sm, ...shadow.raised },
  grip: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: palette.lineStrong, marginBottom: space.sm },
  title: { paddingHorizontal: space.xl, paddingBottom: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.xl, minHeight: 56 },
  rowPressed: { backgroundColor: palette.wash },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, minWidth: 0, minHeight: 56, justifyContent: "center", paddingVertical: space.sm },
  hairline: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.lineStrong },
});
