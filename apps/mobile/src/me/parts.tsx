import type { ReactNode } from "react";
import { Pressable, StyleSheet, Switch, TextInput, View, type TextInputProps } from "react-native";
import { fonts, glass, Icon, palette, plain, radius, space, Text, textStart, type IconName } from "@/ui";

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

/**
 * Invite a friend: the one tinted block on Me (the theme's soft colour), with "I have an invite
 * code" as its second row.
 */
export function InviteCard({ title, value, onInvite, codeLabel, onCode }: { title: string; value?: string; onInvite: () => void; codeLabel: string; onCode: () => void }) {
  return (
    <View style={styles.invite}>
      <InviteRow icon="heart" title={title} value={value} onPress={onInvite} strong />
      <View style={styles.inviteLine} />
      <InviteRow icon="key-outline" title={codeLabel} onPress={onCode} />
    </View>
  );
}

function InviteRow({ icon, title, value, onPress, strong }: { icon: IconName; title: string; value?: string; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${plain(title)}, ${value}` : plain(title)} style={({ pressed }) => [styles.inviteRow, pressed && styles.pressed]}>
      <Icon name={icon} size={22} color={palette.primaryInk} />
      <View style={styles.flex}>
        <Text variant={strong ? "bodyStrong" : "body"} color={palette.primaryInk} numberOfLines={1}>
          {plain(title)}
        </Text>
        {value ? (
          <Text variant="small" color={palette.primaryInk} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={18} color={palette.primaryInk} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.6 },
  group: { gap: space.sm },
  groupTitle: { paddingHorizontal: space.lg },
  card: { ...glass, borderRadius: radius.lg, paddingHorizontal: space.lg },
  field: { gap: space.sm, paddingVertical: space.md },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.lineStrong },
  input: { minHeight: 46, backgroundColor: palette.wash, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 16, fontFamily: fonts.body, color: palette.ink },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, paddingVertical: space.sm },
  invite: { backgroundColor: palette.primarySoft, borderRadius: radius.lg, overflow: "hidden" },
  inviteRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 56, paddingVertical: space.sm },
  inviteLine: { height: StyleSheet.hairlineWidth, backgroundColor: palette.lineStrong, marginHorizontal: space.lg },
});
