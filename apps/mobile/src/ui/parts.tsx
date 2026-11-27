import { useCallback, useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";
import { plain } from "./plain";
import { ZakiAvatar } from "./Zaki";
import { fonts, glass, kind, minTouch, palette, radius, space, type IconKind } from "./tokens";

/**
 * A scrolling page over the colour mesh, with pull-to-refresh when `onRefresh` is given.
 * The spinner shows only for a pull the person made, and for at most PULL_SPINNER_MS: the data
 * keeps loading behind and draws when it lands. Background reloads (useLive) never show it.
 * The RefreshControl is remounted after each pull because Android sometimes leaves the circle
 * on screen after `refreshing` goes back to false.
 */
export function Screen({ children, onRefresh, contentStyle, keyboard }: { children: ReactNode; onRefresh?: () => unknown; refreshing?: boolean; contentStyle?: ViewStyle; keyboard?: boolean }) {
  // Edge-to-edge Android: the last thing on the page must clear the system buttons.
  const bottom = useSafeAreaInsets().bottom;
  const [pulling, setPulling] = useState(false);
  const [round, setRound] = useState(0);
  const pull = useCallback(() => {
    setPulling(true);
    const started = Date.now();
    let done = false;
    const stop = () => {
      if (done) return;
      done = true;
      // Never flip true -> false in the same frame (the stuck-spinner case on Android).
      setTimeout(() => {
        setPulling(false);
        setRound((r) => r + 1);
      }, Math.max(0, PULL_MIN_MS - (Date.now() - started)));
    };
    setTimeout(stop, PULL_SPINNER_MS);
    void Promise.resolve()
      .then(() => onRefresh?.())
      .catch(() => {})
      .finally(stop);
  }, [onRefresh]);
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.content, { paddingBottom: space.xxxl + bottom }, contentStyle]}
      keyboardShouldPersistTaps={keyboard ? "handled" : undefined}
      refreshControl={onRefresh ? <RefreshControl key={round} refreshing={pulling} onRefresh={pull} tintColor={palette.primary} colors={[palette.primary]} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

const PULL_SPINNER_MS = 1500;
const PULL_MIN_MS = 400;

/** A surface that groups one thing. Pass `onPress` to make the whole card a button. */
export function Card({ children, onPress, style, tone, accessibilityLabel }: { children: ReactNode; onPress?: () => void; style?: ViewStyle | ViewStyle[]; tone?: string; accessibilityLabel?: string }) {
  const base = [styles.card, tone ? { backgroundColor: tone + "E6" } : null, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [...base, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

/** Heading above a group, with an optional action on the far side. */
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text variant="headline" style={styles.flex}>
        {title}
      </Text>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={10} style={styles.sectionAction}>
          <Text variant="smallStrong" color={palette.primaryInk}>
            {plain(action)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Rounded tile holding an icon. `kind` colours it by what it is about (money, people, place,
 * alarm; tokens.ts); `color` / `bg` are for a circle's own colours (family, friends).
 */
export function IconTile({ name, kind: k = "primary", color = kind[k].ink, bg = kind[k].bg, size = 44 }: { name: IconName; kind?: IconKind; color?: string; bg?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Icon name={name} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

/** Initials in a circle, for people in a circle. */
export function PersonAvatar({ name, size = 40, color = palette.family, bg = palette.familySoft }: { name: string; size?: number; color?: string; bg?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "•";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Text variant="bodyStrong" color={color} align="center" style={{ fontSize: size * 0.42, lineHeight: size * 0.6 }}>
        {initial}
      </Text>
    </View>
  );
}

/** One line in a list: leading visual, title and detail, trailing action or chevron. */
export function ListRow({ leading, title, meta, trailing, onPress, strike }: { leading?: ReactNode; title: string; meta?: string; trailing?: ReactNode; onPress?: () => void; strike?: boolean }) {
  const body = (
    <>
      {leading}
      <View style={styles.flex}>
        <Text variant="bodyStrong" color={strike ? palette.inkFaint : palette.ink} style={strike ? styles.strike : undefined} numberOfLines={2}>
          {title}
        </Text>
        {meta ? (
          <Text variant="small" color={palette.inkSoft} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevron-forward" size={18} color={palette.inkFaint} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

/** A selectable pill: filters, choices, check-ins. */
export function Chip({ label, selected, onPress, icon, tone = "primary" }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; tone?: "primary" | "family" | "calm" }) {
  const fg = tone === "family" ? palette.family : tone === "calm" ? palette.calm : palette.primaryInk;
  const soft = tone === "family" ? palette.familySoft : tone === "calm" ? palette.calmSoft : palette.primarySoft;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [styles.chip, selected ? { backgroundColor: fg, borderColor: fg } : pressed ? { backgroundColor: soft } : null]}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? "#fff" : fg} /> : null}
      <Text variant="smallStrong" color={selected ? "#fff" : palette.ink}>
        {plain(label)}
      </Text>
    </Pressable>
  );
}

/** Small status pill (confirmed, pending…). */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "ok" | "warn" | "danger" | "primary" | "calm" }) {
  const map = {
    neutral: [palette.surfaceAlt, palette.inkSoft],
    ok: [palette.okSoft, palette.ok],
    warn: [palette.warnSoft, palette.warn],
    danger: [palette.dangerSoft, palette.danger],
    primary: [palette.primarySoft, palette.primaryInk],
    calm: [palette.calmSoft, palette.calm],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text variant="caption" color={fg} style={{ fontFamily: fonts.bodySemi }}>
        {plain(label)}
      </Text>
    </View>
  );
}

/** Thin progress bar. */
export function ProgressBar({ value, color = palette.primary }: { value: number; color?: string }) {
  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

/** What a screen shows before there is anything in it: Zaki says what will appear here. */
export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <ZakiAvatar size={56} glow mood="calm" />
      <Text variant="headline" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="small" color={palette.inkSoft} align="center" style={styles.emptyBody}>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

/** A quiet note: offline, hints, fine print. */
export function Note({ children, icon = "information-circle-outline", tone = "neutral" }: { children: string; icon?: IconName; tone?: "neutral" | "warn" }) {
  const fg = tone === "warn" ? palette.warn : palette.inkSoft;
  return (
    <View style={[styles.note, tone === "warn" && { backgroundColor: palette.warnSoft }]}>
      <Icon name={icon} size={18} color={fg} />
      <Text variant="small" color={fg} style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.bg },
  content: { padding: space.lg, paddingBottom: space.xxxl, gap: space.md },
  card: { ...glass, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  section: { flexDirection: "row", alignItems: "center", marginTop: space.md, gap: space.sm },
  sectionAction: { minHeight: 32, justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  row: { ...glass, flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  strike: { textDecorationLine: "line-through" },
  chip: { flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 40, paddingHorizontal: space.md + 2, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.lineStrong, backgroundColor: palette.surface },
  badge: { paddingHorizontal: space.sm + 2, paddingVertical: 3, borderRadius: radius.pill, alignSelf: "flex-start" },
  track: { height: 8, borderRadius: 4, backgroundColor: palette.wash, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyBody: { maxWidth: 320 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, backgroundColor: palette.wash, borderRadius: radius.md, padding: space.md },
});

export { minTouch };
