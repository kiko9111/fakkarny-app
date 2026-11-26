import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { t } from "@/i18n";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";
import { ZakiAvatar } from "./Zaki";
import { plain } from "./plain";
import { glass, palette, radius, shadow, space } from "./tokens";

/**
 * The layout rebuild's shared pieces (spec: "Ten rules every screen follows").
 *   Segmented   a switch between 2-3 views of one screen (rule 8)
 *   Tile, TileGrid   a summary screen's two-column tiles (rule 2)
 *   NavRow, RowGroup   settings-style rows in one card (Me, Circle info)
 *   IntroPanel  an empty screen or a not-yet-opened tab: Zaki, one sentence, one button (rule 10)
 * The "+" and its sheet are in AddSheet.tsx.
 */

/**
 * A switch between views. Two or three one-word parts of equal width in one pill; a label never
 * wraps (it shrinks first). Switches are for views; an answer to pick is a `Chip`.
 */
export function Segmented<K extends string>({ options, value, onChange }: { options: readonly { key: K; label: string }[]; value: K; onChange: (key: K) => void }) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => (on ? undefined : onChange(o.key))} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={plain(o.label)} style={[styles.part, on && styles.partOn]}>
            <Text variant="smallStrong" color={on ? palette.ink : palette.inkSoft} align="center" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {plain(o.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type TileTone = "ok" | "warn" | "danger" | "primary";
const TONE: Record<TileTone, string> = { ok: palette.ok, warn: palette.warn, danger: palette.danger, primary: palette.primaryInk };

/**
 * One tile of a summary: what it is, the number or short value, and one line under it. The tile
 * stays white; `tone` colours only the line under the value (something is due, owed, done).
 */
export function Tile({ title, value, line, icon, onPress, tone }: { title: string; value?: string; line?: string; icon?: IconName; onPress?: () => void; tone?: TileTone }) {
  const body = (
    <>
      <View style={styles.tileHead}>
        {icon ? <Icon name={icon} size={18} color={palette.inkSoft} /> : null}
        <Text variant="smallStrong" color={palette.inkSoft} numberOfLines={1} style={styles.flex}>
          {plain(title)}
        </Text>
      </View>
      {value !== undefined ? (
        <Text variant="title" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {plain(value)}
        </Text>
      ) : null}
      {line ? (
        <Text variant="caption" color={tone ? TONE[tone] : palette.inkSoft} numberOfLines={2}>
          {plain(line)}
        </Text>
      ) : null}
    </>
  );
  if (!onPress) return <View style={styles.tile}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={[title, value, line].filter(Boolean).map((s) => plain(s as string)).join(", ")} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

/** Tiles two to a row, equal widths; an odd last tile keeps its half. */
export function TileGrid({ children }: { children: ReactNode }) {
  const tiles = Children.toArray(children);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
  return (
    <View style={styles.grid}>
      {rows.map((row, i) => (
        <View key={i} style={styles.gridRow}>
          <View style={styles.cell}>{row[0]}</View>
          <View style={styles.cell}>{row[1]}</View>
        </View>
      ))}
    </View>
  );
}

/**
 * A row that opens one topic: icon, title, the current value under it, a chevron. Inside a
 * `RowGroup`. `danger` is for the last row of an info page (leave, delete), behind `confirm`.
 * `first` leaves out the hairline above; `RowGroup` sets it on its first row by itself.
 */
export function NavRow({ icon, title, value, onPress, danger, first }: { icon?: IconName; title: string; value?: string; onPress?: () => void; danger?: boolean; first?: boolean }) {
  const ink = danger ? palette.danger : palette.ink;
  const body = (
    <>
      {icon ? <Icon name={icon} size={22} color={danger ? palette.danger : palette.inkSoft} /> : null}
      <View style={[styles.rowBody, !first && styles.hairline]}>
        <View style={styles.flex}>
          <Text variant="body" color={ink} numberOfLines={1} style={styles.rowTitle}>
            {plain(title)}
          </Text>
          {value ? (
            <Text variant="small" color={palette.inkSoft} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
        </View>
        {onPress && !danger ? <Icon name="chevron-forward" size={18} color={palette.inkFaint} /> : null}
      </View>
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${plain(title)}, ${value}` : plain(title)} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {body}
    </Pressable>
  );
}

/** Rows in one card with hairlines between them, and a quiet title above. */
export function RowGroup({ title, children }: { title?: string; children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <View style={styles.group}>
      {title ? (
        <Text variant="smallStrong" color={palette.inkSoft} style={styles.groupTitle}>
          {plain(title)}
        </Text>
      ) : null}
      <View style={styles.groupCard}>{rows.map((row, i) => (i === 0 && isValidElement(row) && (row.props as { first?: boolean }).first === undefined ? cloneElement(row as ReactElement<{ first?: boolean }>, { first: true }) : row))}</View>
    </View>
  );
}

/**
 * Zaki talking where there is nothing yet (an empty screen, a tab not opened before): one
 * sentence, one button, and with `say` the words she could type in the chat instead.
 */
export function IntroPanel({ title, body, action, onAction, say }: { title: string; body?: string; action?: string; onAction?: () => void; say?: string }) {
  return (
    <View style={styles.intro}>
      <ZakiAvatar size={64} mood="calm" />
      <Text variant="headline" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="small" color={palette.inkSoft} align="center" style={styles.introBody}>
          {body}
        </Text>
      ) : null}
      {action && onAction ? <Button label={action} onPress={onAction} style={styles.introButton} /> : null}
      {say ? (
        <Text variant="caption" color={palette.inkSoft} align="center" style={styles.introBody}>
          {t.lay.common.orTellZaki.replace("{words}", say)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },

  track: { flexDirection: "row", alignSelf: "stretch", minHeight: 44, padding: 3, borderRadius: radius.pill, backgroundColor: palette.wash },
  part: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: space.sm, borderRadius: radius.pill },
  partOn: { backgroundColor: palette.surfaceSolid, ...shadow.card },

  grid: { gap: space.md },
  gridRow: { flexDirection: "row", gap: space.md },
  cell: { flex: 1, minWidth: 0 },
  tile: { ...glass, flex: 1, borderRadius: radius.lg, padding: space.lg, gap: space.xxs, minHeight: 104 },
  tileHead: { flexDirection: "row", alignItems: "center", gap: space.xs + 2, marginBottom: space.xs },

  group: { gap: space.sm },
  groupTitle: { paddingHorizontal: space.lg },
  groupCard: { ...glass, borderRadius: radius.lg, overflow: "hidden" },
  // Horizontal padding, not start/end: the browser preview does not flip those in Arabic.
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 56 },
  rowPressed: { backgroundColor: palette.wash },
  rowBody: { flex: 1, minWidth: 0, minHeight: 56, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  rowTitle: { fontFamily: "IBMPlexSansArabic_500Medium" },
  hairline: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.lineStrong },

  intro: { alignItems: "center", gap: space.sm, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  introBody: { maxWidth: 320 },
  introButton: { marginTop: space.sm, minWidth: 160 },
});
