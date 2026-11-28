import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "@/i18n";
import { createEmitter } from "@/lib/emitter";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { palette, radius, shadow, space } from "./tokens";

export interface DialogAction {
  label: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}
interface DialogRequest {
  title: string;
  message?: string;
  actions: DialogAction[];
}
/** One way back on a snackbar ("Undo"): shown for longer, gone once tapped. */
export interface SnackAction {
  label: string;
  onPress: () => void;
}
interface SnackRequest {
  text: string;
  tone: "ok" | "error" | "info";
  key: number;
  action?: SnackAction;
}

const dialogs = createEmitter<DialogRequest>();
const snacks = createEmitter<SnackRequest>();

/**
 * A decision that must interrupt (delete, leave, pick a day). The phone uses its own
 * Material/iOS dialog; the browser, which has no native one, gets the same dialog drawn here.
 */
export function ask(title: string, message?: string, actions: DialogAction[] = [{ label: t.ui.ok }]) {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, actions.map((a) => ({ text: a.label, style: a.style, onPress: a.onPress })));
    return;
  }
  dialogs.emit({ title, message, actions });
}

/** Ask "are you sure?" with a destructive yes. */
export function confirm(title: string, yes: string, onYes: () => void, no: string = t.ui.cancel, message?: string) {
  ask(title, message, [
    { label: no, style: "cancel" },
    { label: yes, style: "destructive", onPress: onYes },
  ]);
}

/** Short feedback that goes away by itself (Material snackbar): "Sent", "Couldn't save". */
export function notify(text: string, tone: SnackRequest["tone"] = "ok", action?: SnackAction) {
  snacks.emit({ text, tone, key: Date.now(), action });
}

/** Mounted once in the root layout: draws snackbars (everywhere) and dialogs (web). */
export function FeedbackHost() {
  const insets = useSafeAreaInsets();
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [snack, setSnack] = useState<SnackRequest | null>(null);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => dialogs.subscribe(setDialog), []);
  useEffect(
    () =>
      snacks.subscribe((s) => {
        setSnack(s);
        anim.setValue(0);
        Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== "web" }).start();
      }),
    [anim],
  );
  useEffect(() => {
    if (!snack) return;
    const timer = setTimeout(() => setSnack(null), snack.action ? 6000 : 3200);
    return () => clearTimeout(timer);
  }, [snack]);

  const close = (a?: DialogAction) => {
    setDialog(null);
    a?.onPress?.();
  };

  return (
    <>
      {snack ? (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.snackWrap, { bottom: insets.bottom + 84, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}
        >
          <View style={styles.snack} accessibilityLiveRegion="polite">
            <Icon name={snack.tone === "error" ? "alert-circle" : snack.tone === "info" ? "information-circle" : "checkmark-circle"} size={20} color={snack.tone === "error" ? "#FFB4A9" : "#A8E0BC"} />
            <Text variant="smallStrong" color="#FFFFFF" style={styles.flex}>
              {snack.text}
            </Text>
            {snack.action ? (
              <Pressable
                onPress={() => {
                  const act = snack.action!;
                  setSnack(null);
                  act.onPress();
                }}
                accessibilityRole="button"
                accessibilityLabel={snack.action.label}
                hitSlop={8}
                style={styles.snackAction}
              >
                <Text variant="label" color="#FFD9A6">
                  {snack.action.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
      {dialog ? (
        <View style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close(dialog.actions.find((a) => a.style === "cancel"))} accessibilityLabel={t.ui.cancel} />
          <View style={styles.dialog} accessibilityRole="alert">
            <Text variant="title">{dialog.title}</Text>
            {dialog.message ? (
              <Text variant="body" color={palette.inkSoft}>
                {dialog.message}
              </Text>
            ) : null}
            <View style={styles.actions}>
              {dialog.actions.map((a) => (
                <Pressable key={a.label} onPress={() => close(a)} accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && { backgroundColor: palette.surfaceAlt }]}>
                  <Text variant="label" color={a.style === "destructive" ? palette.danger : a.style === "cancel" ? palette.inkSoft : palette.primaryInk}>
                    {a.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  snackWrap: { position: "absolute", left: space.lg, right: space.lg, alignItems: "center" },
  snack: { flexDirection: "row", alignItems: "center", gap: space.sm, maxWidth: 480, width: "100%", backgroundColor: "rgba(47,38,33,0.92)", borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, ...shadow.raised },
  snackAction: { minHeight: 44, minWidth: 48, paddingHorizontal: space.sm, alignItems: "center", justifyContent: "center" },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: palette.scrim, alignItems: "center", justifyContent: "center", padding: space.xl },
  dialog: { width: "100%", maxWidth: 380, backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.glassEdge, borderRadius: radius.xl, padding: space.xl, gap: space.md, ...shadow.raised },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: space.xs, marginTop: space.xs },
  action: { minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.pill, justifyContent: "center" },
});
