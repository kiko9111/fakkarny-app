import { useCallback, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
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
import { colors } from "@/lib/theme";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segment, value === o.value && styles.segmentOn]}>
          <Text style={[styles.segmentText, value === o.value && styles.segmentTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

/** F10 / FR-13: wake/sleep, check-ins, tone, language, memories, export, delete account. */
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
      Alert.alert(t.saved.offline);
    }
  };

  const saveInstapay = () => {
    const text = instapay.trim();
    if (text === (user?.instapay_link ?? "")) return;
    const link = text ? parseInstapayLink(text) : null;
    if (text && !link) return Alert.alert(t.daftar.instapayInvalid);
    setInstapay(link ?? "");
    void save({ instapay_link: link });
  };

  const saveTimes = () => {
    if (!TIME_RE.test(wake) || !TIME_RE.test(sleep)) return Alert.alert(t.settings.invalidTime);
    void save({ wake_time: wake, sleep_time: sleep });
  };

  const changeLanguage = (lang: "ar-EG" | "en") => {
    if (lang === language) return;
    prefs.set("language", lang);
    void save({ language: lang });
    Alert.alert(t.settings.restart, undefined, [{ text: "OK", onPress: () => void reloadApp() }]);
  };

  const doExport = async () => {
    try {
      const data = await exportData();
      const file = new File(Paths.cache, `fakkarni-export-${data.exported_at.slice(0, 10)}.json`);
      file.create({ overwrite: true });
      file.write(JSON.stringify(data, null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
    } catch {
      Alert.alert(t.saved.offline);
    }
  };

  const doDelete = () =>
    Alert.alert(t.settings.delete, t.settings.deleteConfirm, [
      { text: t.settings.cancel, style: "cancel" },
      {
        text: t.settings.confirm,
        style: "destructive",
        onPress: async () => {
          try {
            await deleteAccount();
            await signOut();
            await resetLocalData();
            router.replace("/onboarding");
          } catch {
            Alert.alert(t.saved.offline);
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.section}>{t.settings.account}</Text>
      <View style={styles.card}>
        <Text style={styles.value}>{account ? `${t.settings.signedInAs} ${account}` : t.settings.notSignedIn}</Text>
        {authAvailable ? (
          account ? (
            <Pressable onPress={() => void signOut().then(() => setAccount(null))}>
              <Text style={styles.link}>{t.settings.signOut}</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push("/onboarding")}>
              <Text style={styles.link}>{t.settings.signIn}</Text>
            </Pressable>
          )
        ) : null}
      </View>

      <View style={styles.card}>
        <Row label={t.settings.name}>
          <TextInput style={styles.input} value={name} onChangeText={setName} onEndEditing={() => void save({ name: name.trim() || null })} textAlign="start" />
        </Row>
        <Row label={t.settings.language}>
          <Segmented value={language} onChange={changeLanguage} options={[{ value: "ar-EG", label: t.onboarding.arabic }, { value: "en", label: t.onboarding.english }]} />
        </Row>
        <Row label={t.settings.wake}>
          <TextInput style={styles.time} value={wake} onChangeText={setWake} onEndEditing={saveTimes} keyboardType="numbers-and-punctuation" maxLength={5} />
        </Row>
        <Row label={t.settings.sleep}>
          <TextInput style={styles.time} value={sleep} onChangeText={setSleep} onEndEditing={saveTimes} keyboardType="numbers-and-punctuation" maxLength={5} />
        </Row>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>{t.daftar.instapayLabel}</Text>
        <TextInput style={styles.input} value={instapay} onChangeText={setInstapay} onEndEditing={saveInstapay} placeholder={t.daftar.instapayPlaceholder} autoCapitalize="none" autoCorrect={false} keyboardType="url" textAlign="left" />
        <Text style={styles.label}>{t.daftar.instapayHint}</Text>
      </View>

      <View style={styles.card}>
        <Row label={t.settings.checkins}>
          <Segmented
            value={user?.checkin_interval_h ?? "2"}
            onChange={(v) => void save({ checkin_interval_h: v })}
            options={[{ value: "2", label: t.settings.every2 }, { value: "4", label: t.settings.every4 }, { value: "off", label: t.settings.off }]}
          />
        </Row>
        <Row label={t.settings.tone}>
          <Segmented
            value={user?.tone ?? "balanced"}
            onChange={(v) => void save({ tone: v })}
            options={[{ value: "playful", label: t.settings.playful }, { value: "balanced", label: t.settings.balanced }, { value: "calm", label: t.settings.calm }]}
          />
        </Row>
        <View style={styles.switchRow}>
          <Text style={[styles.label, styles.flex]}>{t.settings.alwaysDirect}</Text>
          <Switch
            value={user?.always_direct ?? false}
            onValueChange={(v) => {
              prefs.set("always_direct", v ? "1" : "0");
              void save({ always_direct: v });
            }}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Pressable onPress={() => router.push("/memories")}>
          <Text style={styles.link}>{t.settings.memories}</Text>
        </Pressable>
        <Pressable onPress={() => void doExport()}>
          <Text style={styles.link}>{t.settings.export}</Text>
        </Pressable>
        <Pressable onPress={doDelete}>
          <Text style={[styles.link, styles.danger]}>{t.settings.delete}</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => void Linking.openURL(legalUrl(API_URL, "terms", language))}>
        <Text style={styles.link}>{t.paywall.termsLink}</Text>
      </Pressable>
      <Pressable onPress={() => void Linking.openURL(legalUrl(API_URL, "privacy", language))}>
        <Text style={styles.link}>{t.paywall.privacyLink}</Text>
      </Pressable>
      <Text style={styles.footer}>{t.settings.aiDisclosure}</Text>
      <Text style={styles.footerSmall}>{API_URL}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  section: { fontSize: 14, fontWeight: "700", color: colors.muted, textAlign: "left" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 14 },
  row: { gap: 6 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  label: { fontSize: 14, color: colors.muted, textAlign: "left" },
  value: { fontSize: 15, color: colors.text, textAlign: "left" },
  input: { borderWidth: 1, borderColor: "#E5DDD5", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, color: colors.text },
  time: { borderWidth: 1, borderColor: "#E5DDD5", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, width: 90, color: colors.text, textAlign: "center" },
  segmented: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  segment: { borderWidth: 1, borderColor: "#E5DDD5", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  segmentOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  segmentText: { color: colors.text },
  segmentTextOn: { color: "#fff", fontWeight: "600" },
  link: { color: colors.accent, fontSize: 16, fontWeight: "600", textAlign: "left" },
  danger: { color: colors.error },
  footer: { textAlign: "center", color: colors.muted, marginTop: 8 },
  footerSmall: { textAlign: "center", color: colors.muted, fontSize: 11 },
});
