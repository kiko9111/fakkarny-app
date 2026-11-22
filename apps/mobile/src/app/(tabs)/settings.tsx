import { useCallback, useState, type ReactNode } from "react";
import { Linking, Platform, Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { parseInstapayLink, type PatchMeRequest, type User } from "@fakkarni/shared";
import { authAvailable, currentAccountLabel, signOut } from "@/auth";
import { resetLocalData } from "@/db/reset";
import { language, t } from "@/i18n";
import { API_URL, deleteAccount, exportData, getMe, patchMe } from "@/lib/api";
import { legalUrl } from "@/lib/api-url";
import { prefs } from "@/lib/prefs";
import { reloadApp } from "@/lib/reload";
import { ask, Button, Card, confirm, fonts, Icon, notify, palette, PersonAvatar, radius, Screen, space, Text, textStart, type IconName } from "@/ui";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.segment, on && styles.segmentOn]}>
            <Text variant="smallStrong" color={on ? palette.ink : palette.inkSoft} align="center">
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text variant="smallStrong" color={palette.inkSoft} style={styles.groupTitle}>
        {title}
      </Text>
      <Card style={styles.groupCard}>{children}</Card>
    </View>
  );
}

function Field({ label, children, first }: { label: string; children: ReactNode; first?: boolean }) {
  return (
    <View style={[styles.field, !first && styles.fieldLine]}>
      <Text variant="small" color={palette.inkSoft}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function LinkRow({ icon, label, onPress, danger, first }: { icon: IconName; label: string; onPress: () => void; danger?: boolean; first?: boolean }) {
  const color = danger ? palette.danger : palette.ink;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.linkRow, !first && styles.fieldLine, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={20} color={danger ? palette.danger : palette.inkSoft} />
      <Text variant="body" color={color} style={styles.flex}>
        {label}
      </Text>
      {!danger ? <Icon name="chevron-forward" size={18} color={palette.inkFaint} /> : null}
    </Pressable>
  );
}

/** F10 / FR-13: you, your day's rhythm, how Zaki talks, your data. */
export default function SettingsScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [wake, setWake] = useState("");
  const [sleep, setSleep] = useState("");
  const [instapay, setInstapay] = useState("");

  useFocusEffect(
    useCallback(() => {
      void currentAccountLabel().then(setAccount);
      void getMe()
        .then((u) => {
          setUser(u);
          setName(u.name ?? "");
          setWake(u.wake_time);
          setSleep(u.sleep_time);
          setInstapay(u.instapay_link ?? "");
          prefs.set("always_direct", u.always_direct ? "1" : "0");
        })
        .catch(() => {});
    }, []),
  );

  const save = async (patch: PatchMeRequest) => {
    try {
      setUser(await patchMe(patch));
    } catch {
      notify(t.saved.offline, "error");
    }
  };

  const saveInstapay = () => {
    const text = instapay.trim();
    if (text === (user?.instapay_link ?? "")) return;
    const link = text ? parseInstapayLink(text) : null;
    if (text && !link) return notify(t.daftar.instapayInvalid, "error");
    setInstapay(link ?? "");
    void save({ instapay_link: link });
  };

  const saveTimes = () => {
    if (!TIME_RE.test(wake) || !TIME_RE.test(sleep)) return notify(t.settings.invalidTime, "error");
    void save({ wake_time: wake, sleep_time: sleep });
  };

  const changeLanguage = (lang: "ar-EG" | "en") => {
    if (lang === language) return;
    prefs.set("language", lang);
    void save({ language: lang });
    ask(t.settings.restart, undefined, [{ label: t.ui.ok, onPress: () => void reloadApp() }]);
  };

  const doExport = async () => {
    try {
      const data = await exportData();
      if (Platform.OS === "web") return notify(t.ui.exportPhone, "info");
      const file = new File(Paths.cache, `zaki-export-${data.exported_at.slice(0, 10)}.json`);
      file.create({ overwrite: true });
      file.write(JSON.stringify(data, null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
    } catch {
      notify(t.saved.offline, "error");
    }
  };

  const doDelete = () =>
    confirm(
      t.settings.delete,
      t.settings.confirm,
      async () => {
        try {
          await deleteAccount();
          await signOut();
          await resetLocalData();
          router.replace("/onboarding");
        } catch {
          notify(t.saved.offline, "error");
        }
      },
      t.settings.cancel,
      t.settings.deleteConfirm,
    );

  const input = (value: string, set: (v: string) => void, onEnd: () => void, extra: object = {}) => (
    <TextInput style={styles.input} value={value} onChangeText={set} onEndEditing={onEnd} onBlur={onEnd} placeholderTextColor={palette.inkFaint} textAlign={textStart} {...extra} />
  );

  return (
    <Screen keyboard>
      <Card style={styles.profile}>
        <PersonAvatar name={name || "Z"} size={56} color={palette.primaryInk} bg={palette.primarySoft} />
        <View style={styles.flex}>
          <Text variant="title">{name || t.ui.tabMe}</Text>
          <Text variant="small" color={palette.inkSoft}>
            {account ? `${t.settings.signedInAs} ${account}` : t.settings.notSignedIn}
          </Text>
        </View>
        {authAvailable ? account ? <Button label={t.settings.signOut} kind="text" size="sm" onPress={() => void signOut().then(() => setAccount(null))} /> : <Button label={t.settings.signIn} kind="tonal" size="sm" onPress={() => router.push("/onboarding")} /> : null}
      </Card>

      <Group title={t.ui.profile}>
        <Field label={t.settings.name} first>
          {input(name, setName, () => void save({ name: name.trim() || null }))}
        </Field>
        <Field label={t.settings.language}>
          <Segmented value={language} onChange={changeLanguage} options={[{ value: "ar-EG", label: t.onboarding.arabic }, { value: "en", label: t.onboarding.english }]} />
        </Field>
      </Group>

      <Group title={t.ui.rhythm}>
        <View style={styles.times}>
          <Field label={t.settings.wake} first>
            {input(wake, setWake, saveTimes, { keyboardType: "numbers-and-punctuation", maxLength: 5, style: [styles.input, styles.time] })}
          </Field>
          <Field label={t.settings.sleep} first>
            {input(sleep, setSleep, saveTimes, { keyboardType: "numbers-and-punctuation", maxLength: 5, style: [styles.input, styles.time] })}
          </Field>
        </View>
        <Field label={t.settings.checkins}>
          <Segmented
            value={user?.checkin_interval_h ?? "2"}
            onChange={(v) => void save({ checkin_interval_h: v })}
            options={[{ value: "2", label: t.settings.every2 }, { value: "4", label: t.settings.every4 }, { value: "off", label: t.settings.off }]}
          />
        </Field>
      </Group>

      <Group title={t.ui.zakiStyle}>
        <Field label={t.settings.tone} first>
          <Segmented
            value={user?.tone ?? "balanced"}
            onChange={(v) => void save({ tone: v })}
            options={[{ value: "playful", label: t.settings.playful }, { value: "balanced", label: t.settings.balanced }, { value: "calm", label: t.settings.calm }]}
          />
        </Field>
        <View style={[styles.switchRow, styles.fieldLine]}>
          <Text variant="body" style={styles.flex}>
            {t.settings.alwaysDirect}
          </Text>
          <Switch
            value={user?.always_direct ?? false}
            trackColor={{ true: palette.primary, false: palette.lineStrong }}
            thumbColor={palette.surface}
            onValueChange={(v) => {
              prefs.set("always_direct", v ? "1" : "0");
              void save({ always_direct: v });
            }}
          />
        </View>
      </Group>

      <Group title={t.daftar.instapayLabel}>
        <View style={styles.field}>
          {input(instapay, setInstapay, saveInstapay, { placeholder: t.daftar.instapayPlaceholder, autoCapitalize: "none", autoCorrect: false, keyboardType: "url", textAlign: "left" })}
          <Text variant="caption" color={palette.inkSoft}>
            {t.daftar.instapayHint}
          </Text>
        </View>
      </Group>

      <Group title={t.ui.yourData}>
        <LinkRow first icon="bulb-outline" label={t.settings.memories} onPress={() => router.push("/memories")} />
        <LinkRow icon="download-outline" label={t.settings.export} onPress={() => void doExport()} />
        <LinkRow icon="trash-outline" label={t.settings.delete} danger onPress={doDelete} />
      </Group>

      <Group title={t.ui.legal}>
        <LinkRow first icon="document-text-outline" label={t.paywall.termsLink} onPress={() => void Linking.openURL(legalUrl(API_URL, "terms", language))} />
        <LinkRow icon="shield-checkmark-outline" label={t.paywall.privacyLink} onPress={() => void Linking.openURL(legalUrl(API_URL, "privacy", language))} />
      </Group>

      <Text variant="caption" color={palette.inkSoft} align="center">
        {t.settings.aiDisclosure}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  profile: { flexDirection: "row", alignItems: "center", gap: space.md },
  group: { gap: space.xs, marginTop: space.sm },
  groupTitle: { paddingHorizontal: space.xs },
  groupCard: { paddingVertical: space.xs, gap: 0 },
  field: { gap: space.xs + 2, paddingVertical: space.md },
  fieldLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  times: { flexDirection: "row", gap: space.lg },
  input: { minHeight: 46, backgroundColor: palette.surfaceAlt, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 16, fontFamily: fonts.body, color: palette.ink },
  time: { width: 110, textAlign: "center" },
  segmented: { flexDirection: "row", backgroundColor: palette.surfaceAlt, borderRadius: radius.pill, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 38, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: space.sm },
  segmentOn: { backgroundColor: palette.surface, boxShadow: "0px 1px 4px rgba(92, 60, 34, 0.15)" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  linkRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52 },
});
