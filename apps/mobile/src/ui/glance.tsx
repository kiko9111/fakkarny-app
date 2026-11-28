import { Children, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";
import { plain } from "./plain";
import { glass, kind as kinds, palette, space, type IconKind } from "./tokens";

/**
 * Design round 2 ("The Glance"): a screen answers its question in numbers first.
 *   NumberStrip  two or three numbers in one card; tapping one filters the screen under it
 *   StatStrip    the same card for amounts (not tappable)
 *   Rows         rows in one card with hairlines between them (denser than a card per row)
 *   MiniTile, MiniTiles   three small doors in one line
 *   MoreRow      "+N more" at the foot of a `Rows`
 */

/** The radius of a grouped card: tighter than a lone card, so a list reads as one object. */
export const GROUP_RADIUS = 18;

export interface StripCell<K extends string> {
  key: K;
  value: number;
  label: string;
  /** Red ink for the number: only for what is late or missed. */
  danger?: boolean;
}

/**
 * Numbers that sum the screen up. A cell with 0 is left out; the chosen one is underlined in
 * near-black (the theme's colour stays on buttons). Tapping the chosen one again shows everything.
 */
export function NumberStrip<K extends string>({ cells, selected, onSelect }: { cells: readonly StripCell<K>[]; selected: K | null; onSelect: (key: K | null) => void }) {
  const live = cells.filter((c) => c.value > 0);
  if (!live.length) return null;
  return (
    <View style={styles.strip} accessibilityRole="tablist">
      {live.map((c) => {
        const on = c.key === selected;
        return (
          <Pressable key={c.key} onPress={() => onSelect(on ? null : c.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${plain(c.label)}, ${c.value}`} style={({ pressed }) => [styles.cell, pressed && styles.pressed]}>
            <Text variant="title" color={c.danger ? palette.danger : palette.ink} align="center" numberOfLines={1}>
              {String(c.value)}
            </Text>
            <Text variant="caption" color={on ? palette.ink : palette.inkSoft} align="center" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {plain(c.label)}
            </Text>
            <View style={[styles.under, on && styles.underOn]} />
          </Pressable>
        );
      })}
    </View>
  );
}

export interface StatCell {
  key: string;
  /** Already written: "EGP 950", "36%". */
  value: string;
  label: string;
  tone?: "ok" | "danger" | "warn";
}
const STAT_INK = { ok: palette.ok, danger: palette.danger, warn: palette.warn } as const;

/** Two or three amounts that sum a screen up, in the strip's card. Headline amounts carry their unit. */
export function StatStrip({ cells }: { cells: readonly StatCell[] }) {
  if (!cells.length) return null;
  return (
    <View style={styles.strip}>
      {cells.map((c) => (
        <View key={c.key} style={styles.stat} accessible accessibilityLabel={`${plain(c.label)}, ${c.value}`}>
          <Text variant="headline" color={c.tone ? STAT_INK[c.tone] : palette.ink} align="center" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {c.value}
          </Text>
          <Text variant="caption" color={palette.inkSoft} align="center" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {plain(c.label)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Rows in one card, a hairline between each two. Rows bring their own padding and no surface. */
export function Rows({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  if (!rows.length) return null;
  return (
    <View style={styles.rows}>
      {rows.map((row, i) => (
        <View key={i} style={i > 0 ? styles.line : undefined}>
          {row}
        </View>
      ))}
    </View>
  );
}

/** The last row of a capped list: what is left, opened in place. */
export function MoreRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
      <Text variant="smallStrong" color={palette.primaryInk}>
        {label}
      </Text>
      <Icon name="chevron-down" size={16} color={palette.primaryInk} />
    </Pressable>
  );
}

/** A small door: an icon square, a name, one short value. Three sit in a `MiniTiles`. */
export function MiniTile({ icon, kind = "primary", title, line, danger, onPress }: { icon: IconName; kind?: IconKind; title: string; line?: string; danger?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={line ? `${plain(title)}, ${line}` : plain(title)} style={({ pressed }) => [styles.mini, pressed && styles.pressed]}>
      <View style={[styles.miniIcon, { backgroundColor: kinds[kind].bg }]}>
        <Icon name={icon} size={17} color={kinds[kind].ink} />
      </View>
      <Text variant="smallStrong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {plain(title)}
      </Text>
      {line ? (
        <Text variant="caption" color={danger ? palette.danger : palette.inkSoft} numberOfLines={1}>
          {line}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Small doors side by side, equal widths. */
export function MiniTiles({ children }: { children: ReactNode }) {
  return (
    <View style={styles.minis}>
      {Children.toArray(children).map((tile, i) => (
        <View key={i} style={styles.miniCell}>
          {tile}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { backgroundColor: palette.wash },
  strip: { ...glass, flexDirection: "row", borderRadius: GROUP_RADIUS, overflow: "hidden" },
  cell: { flex: 1, minWidth: 0, minHeight: 72, alignItems: "center", justifyContent: "center", paddingTop: space.sm, paddingHorizontal: space.xs },
  stat: { flex: 1, minWidth: 0, minHeight: 68, alignItems: "center", justifyContent: "center", paddingVertical: space.sm, paddingHorizontal: space.sm },
  under: { height: 2, width: 28, borderRadius: 1, marginTop: space.xs, marginBottom: space.sm, backgroundColor: "transparent" },
  underOn: { backgroundColor: palette.ink },

  rows: { ...glass, borderRadius: GROUP_RADIUS, overflow: "hidden" },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.lineStrong },
  more: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs },

  minis: { flexDirection: "row", gap: space.sm },
  miniCell: { flex: 1, minWidth: 0 },
  mini: { ...glass, flex: 1, borderRadius: GROUP_RADIUS, padding: space.md, gap: 2, minHeight: 92 },
  miniIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
});
