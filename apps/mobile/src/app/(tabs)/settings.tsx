import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppState, Linking, Platform, Pressable, StyleSheet, Switch, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { parseInstapayLink, type Item, type PatchMeRequest, type User } from "@fakkarni/shared";
import { authAvailable, currentAccountLabel, signOut } from "@/auth";
import { listAlarms } from "@/db/items";
import { alarmStatus, fullScreenAlarms, openAlarmSetting, testAlarm } from "@/notifications";
import { resetLocalData } from "@/db/reset";
import { saveItem } from "@/sync/save-item";
import { dateLocale, language, t } from "@/i18n";
import { API_URL, deleteAccount, exportData, getMe, patchItem, patchMe, peekMe } from "@/lib/api";
import { failText } from "@/lib/errors";
import { legalUrl } from "@/lib/api-url";
import { prefs } from "@/lib/prefs";
import { reloadApp } from "@/lib/reload";
import { shareInvite } from "@/referral/share";
import { BrainSection, showBrainSettings, VoiceSection } from "@/brain/BrainSettings";
import { ask, Button, Card, confirm, fonts, Icon, notify, palette, PersonAvatar, radius, Screen, space, Text, textStart, ThemePicker, type IconName } from "@/ui";

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
  // Starts from the last profile seen on this phone, so the choices are right at once.
  const [cached] = useState(() => peekMe());
  const [user, setUser] = useState<User | null>(cached);
  const [account, setAccount] = useState<string | null>(null);
  const [name, setName] = useState(cached?.name ?? "");
  const [wake, setWake] = useState(cached?.wake_time ?? "");
  const [sleep, setSleep] = useState(cached?.sleep_time ?? "");
  const [instapay, setInstapay] = useState(cached?.instapay_link ?? "");
  // Shown at once on tap (it used to wait for the server, so a slow or failed save looked like a dead button).
  const [gender, setGender] = useState<"female" | "male" | "">(cached?.gender ?? "");
  const [alarms, setAlarms] = useState<Item[]>([]);
  // What Android lets the full-screen alarm do; read again when the user comes back from Settings.
  const [alarmPerm, setAlarmPerm] = useState(alarmStatus);
  useEffect(() => {
    if (!fullScreenAlarms) return;
    const sub = AppState.addEventListener("change", (s) => s === "active" && setAlarmPerm(alarmStatus()));
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void currentAccountLabel().then(setAccount);
      void listAlarms().then(setAlarms).catch(() => {});
      setAlarmPerm(alarmStatus());
      void getMe()
        .then((u) => {
          setUser(u);
          setName(u.name ?? "");
          setWake(u.wake_time);
          setSleep(u.sleep_time);
          setInstapay(u.instapay_link ?? "");
          setGender(u.gender ?? "");
          prefs.set("always_direct", u.always_direct ? "1" : "0");
        })
        .catch(() => {});
    }, []),
  );

  // Every change shows at once; the server catches up behind, and a failed save puts it back.
  const save = async (patch: PatchMeRequest) => {
    const before = user;
    if (user) setUser({ ...user, ...patch } as User);
    try {
      setUser(await patchMe(patch));
    } catch (err) {
      setUser(before);
      notify(failText(err, t.saved.offline), "error");
    }
  };

  const alarmOff = async (item: Item) => {
    setAlarms((list) => list.filter((i) => i.id !== item.id));
    try {
      const updated = await patchItem(item.id, { alarm: false });
      await saveItem(updated);
    } catch (err) {
      setAlarms((list) => [...list, item]);
      notify(failText(err, t.saved.offline), "error");
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

      <Group title={t.referral.groupTitle}>
        <View style={styles.field}>
          <Text variant="body">{t.referral.groupBody}</Text>
          <Button label={t.referral.inviteButton} kind="whatsapp" icon="logo-whatsapp" block onPress={() => void shareInvite("settings")} />
        </View>
        <LinkRow icon="key-outline" label={t.ui.haveCode} onPress={() => router.push("/invite")} />
      </Group>

      <Group title={t.ui.profile}>
        <Field label={t.settings.name} first>
          {input(name, setName, () => void save({ name: name.trim() || null }))}
        </Field>
        <Field label={t.settings.addressAs}>
          <Segmented
            value={gender}
            onChange={(v) => {
              const before = gender;
              setGender(v);
              void patchMe({ gender: v || null })
                .then(setUser)
                .catch((err) => {
                  setGender(before);
                  notify(failText(err, t.saved.offline), "error");
                });
            }}
            options={[{ value: "female", label: t.settings.female }, { value: "male", label: t.settings.male }]}
          />
        </Field>
        <Field label={t.ui.themeLabel}>
          <ThemePicker />
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
            thumbColor={palette.surfaceSolid}
            onValueChange={(v) => {
              prefs.set("always_direct", v ? "1" : "0");
              void save({ always_direct: v });
            }}
          />
        </View>
      </Group>

      {showBrainSettings() ? (
        <>
          <Group title={t.brain.title}>
            <BrainSection />
          </Group>
          <Group title={t.voice.title}>
            <VoiceSection />
          </Group>
        </>
      ) : null}

      <Group title={t.alarms.title}>
        <View style={styles.field}>
          {alarms.length === 0 ? (
            <Text variant="body" color={palette.inkSoft}>
              {t.alarms.empty}
            </Text>
          ) : (
            alarms.map((a) => (
              <View key={a.id} style={styles.switchRow}>
                <Icon name="alarm" size={20} color={palette.primaryInk} />
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{a.title}</Text>
                  <Text variant="small" color={palette.inkSoft}>
                    {(a.remind_at ?? a.due_at) ? new Date((a.remind_at ?? a.due_at)!).toLocaleString(dateLocale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : t.alarms.noTime}
                    {a.repeat_every_minutes === 1440 ? ` · ${t.alarms.daily}` : ""}
                  </Text>
                </View>
                <Button label={t.alarms.off} size="sm" kind="text" onPress={() => void alarmOff(a)} />
              </View>
            ))
          )}
          {fullScreenAlarms ? (
            <>
              <Text variant="small" color={palette.inkSoft}>
                {t.alarms.fullScreenNote}
              </Text>
              {alarmPerm && !alarmPerm.exact ? (
                <>
                  <Text variant="small" color={palette.inkSoft}>
                    {t.alarms.exactOff}
                  </Text>
                  <Button label={t.alarms.exactAllow} size="sm" kind="tonal" onPress={() => openAlarmSetting("exact")} />
                </>
              ) : null}
              {alarmPerm && !alarmPerm.fullScreen ? (
                <>
                  <Text variant="small" color={palette.inkSoft}>
                    {t.alarms.fullScreenOff}
                  </Text>
                  <Button label={t.alarms.fullScreenAllow} size="sm" kind="tonal" onPress={() => openAlarmSetting("fullScreen")} />
                </>
              ) : null}
              <Button
                label={t.alarms.test}
                size="sm"
                kind="text"
                onPress={() => {
                  if (testAlarm(10)) notify(t.alarms.testSet);
                }}
              />
            </>
          ) : null}
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
        <LinkRow icon="location-outline" label={t.places.row} onPress={() => router.push("/places")} />
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
  segmentOn: { backgroundColor: palette.surfaceSolid, boxShadow: "0px 1px 4px rgba(92, 60, 34, 0.15)" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  linkRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52 },
});
