import { useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { t } from "@/i18n";
import { glass, palette, radius, space } from "./tokens";

/**
 * Motion, kept small: things arrive with a short fade and lift, and a page that is loading keeps
 * its shape with soft blocks instead of a spinner. Only opacity and position move, so the phone
 * runs them off the JS thread (the browser has no such driver). No animation library: these
 * reach every build over the air.
 */
const native = Platform.OS !== "web";

// "Reduce motion" in the phone's accessibility settings: things still fade in, nothing moves or pulses.
let still = false;
void AccessibilityInfo.isReduceMotionEnabled()
  .then((on) => (still = on))
  .catch(() => {});
AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => (still = on));

/**
 * Fades its children in and lifts them into place, once, when they first show. `off` (read when
 * it first shows) draws them in place with no animation: what was already there does not arrive.
 */
export function Appear({ children, style, off = false, rise = 10, ms = 220 }: { children: ReactNode; style?: StyleProp<ViewStyle>; off?: boolean; rise?: number; ms?: number }) {
  const skip = useRef(off).current;
  const v = useRef(new Animated.Value(skip ? 1 : 0)).current;
  useEffect(() => {
    if (skip) return;
    const run = Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: native });
    run.start();
    return () => run.stop();
  }, [skip, v, ms]);
  if (skip) return <View style={style}>{children}</View>;
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [still ? 0 : rise, 0] }) }] }]}>{children}</Animated.View>;
}

/** One slow breath shared by every block of a placeholder, so a page of them pulses together. */
function usePulse() {
  const v = useRef(new Animated.Value(still ? 0.75 : 0.5)).current;
  useEffect(() => {
    if (still) return;
    const half = (toValue: number) => Animated.timing(v, { toValue, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: native });
    const loop = Animated.loop(Animated.sequence([half(1), half(0.5)]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

const WIDTHS = ["62%", "48%", "70%", "54%"] as const;

/**
 * Cards standing in for a list that is on its way (the first time a screen opens with nothing
 * saved): the page keeps its shape, and the real cards land where these stood.
 */
export function LoadingCards({ count = 3, tile = true }: { count?: number; tile?: boolean }) {
  const pulse = usePulse();
  return (
    <View style={styles.cards} accessibilityRole="progressbar" accessibilityLabel={t.ui.loading}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.card}>
          <Animated.View style={[styles.row, { opacity: pulse }]}>
            {tile ? <View style={styles.tile} /> : null}
            <View style={styles.lines}>
              <View style={[styles.line, { width: WIDTHS[i % WIDTHS.length] }]} />
              <View style={[styles.line, styles.thin, { width: WIDTHS[(i + 1) % WIDTHS.length] }]} />
            </View>
          </Animated.View>
        </View>
      ))}
    </View>
  );
}

// The theme's own soft line colours, so the blocks sit in the page like faint ink.
const block = palette.lineStrong;
const styles = StyleSheet.create({
  cards: { gap: space.md },
  card: { ...glass, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  tile: { width: 44, height: 44, borderRadius: 14, backgroundColor: block },
  lines: { flex: 1, gap: space.sm + 2, paddingVertical: space.xs },
  line: { height: 14, borderRadius: 7, backgroundColor: block },
  thin: { height: 10, borderRadius: 5, backgroundColor: palette.line },
});
