import type { ReactNode } from "react";
import { StyleSheet, Switch, TextInput, View, type TextInputProps } from "react-native";
import { Chip, fonts, glass, NavRow, palette, plain, radius, RowGroup, space, Text, textStart } from "@/ui";

/** The pieces the /me pages share: a titled card of fields, a field, a text box, a switch row. */

/** Fields in one card with a quiet title above, the same shape as a `RowGroup`. */
export function FieldGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      {title ? (
        <Text variant="smallStrong" color={palette.inkSoft} style={styles.groupTitle}>
          {plain(title)}
        </Text>
      ) : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/** A label and the control under it. `first` leaves out the hairline above. */
export function Field({ label, children, first }: { label?: string; children: ReactNode; first?: boolean }) {
  return (
    <View style={[styles.field, !first && styles.line]}>
      {label ? (
        <Text variant="small" color={palette.inkSoft}>
          {label}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** An answer to pick: chips (a switch is for views). The picked one is filled. */
export function Choice<K extends string>({ options, value, onChange }: { options: readonly { key: K; label: string }[]; value: K | "" | null; onChange: (key: K) => void }) {
  return (
    <View style={styles.choice} accessibilityRole="radiogroup">
      {options.map((o) => (
        <Chip key={o.key} label={o.label} selected={o.key === value} onPress={() => (o.key === value ? undefined : onChange(o.key))} />
      ))}
    </View>
  );
}

/** Several answers to pick (chips, each filled while picked). */
export function Picks<K extends string>({ options, values, onToggle }: { options: readonly { key: K; label: string }[]; values: readonly string[]; onToggle: (key: K) => void }) {
  return (
    <View style={styles.choice}>
      {options.map((o) => (
        <Chip key={o.key} label={o.label} selected={values.includes(o.key)} onPress={() => onToggle(o.key)} />
      ))}
    </View>
  );
}

/** A text box that saves when it is left (`onEnd`), as Me's boxes always have. */
export function MeInput({ onEnd, style, ...rest }: TextInputProps & { onEnd: () => void }) {
  return <TextInput placeholderTextColor={palette.inkFaint} textAlign={textStart} {...rest} style={[styles.input, style]} onEndEditing={onEnd} onBlur={onEnd} />;
}

export function SwitchRow({ label, value, onChange, first }: { label: string; value: boolean; onChange: (v: boolean) => void; first?: boolean }) {
  return (
    <View style={[styles.switchRow, !first && styles.line]}>
      <Text variant="body" style={styles.flex}>
        {label}
      </Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: palette.primary, false: palette.lineStrong }} thumbColor={palette.surfaceSolid} />
    </View>
  );
}

/** Invite a friend, with "I have an invite code" as its second row. */
export function InviteCard({ title, value, onInvite, codeLabel, onCode }: { title: string; value?: string; onInvite: () => void; codeLabel: string; onCode: () => void }) {
  return (
    <RowGroup>
      <NavRow icon="heart" kind="people" title={title} value={value} onPress={onInvite} />
      <NavRow icon="key-outline" kind="neutral" title={codeLabel} onPress={onCode} />
    </RowGroup>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  group: { gap: space.sm },
  groupTitle: { paddingHorizontal: space.lg },
  card: { ...glass, borderRadius: radius.lg, paddingHorizontal: space.lg },
  field: { gap: space.sm, paddingVertical: space.md },
  choice: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.lineStrong },
  input: { minHeight: 46, backgroundColor: palette.wash, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 16, fontFamily: fonts.body, color: palette.ink },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, paddingVertical: space.sm },
});
