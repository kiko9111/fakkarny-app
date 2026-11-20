import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { billingAvailable, getPlanOptions, purchase, restore, type PlanOption } from "@/billing";
import { language, t } from "@/i18n";
import { legalUrl } from "@/lib/api-url";
import { API_URL } from "@/lib/api";
import { colors } from "@/lib/theme";

/** FR-9: 7-day trial, then monthly or yearly. Prices come from the store (regional pricing). */
export default function PaywallScreen() {
  const [options, setOptions] = useState<PlanOption[] | null>(null);
  const [selected, setSelected] = useState<PlanOption | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!billingAvailable) return setOptions([]);
    getPlanOptions()
      .then((opts) => {
        setOptions(opts);
        setSelected(opts[0] ?? null);
      })
      .catch(() => setOptions([]));
  }, []);

  const buy = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      if (await purchase(selected)) router.back();
    } catch (err) {
      if (!(err as { userCancelled?: boolean }).userCancelled) Alert.alert(t.paywall.failed);
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    setBusy(true);
    try {
      if (await restore()) router.back();
      else Alert.alert(t.paywall.nothingToRestore);
    } catch {
      Alert.alert(t.paywall.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t.paywall.title}</Text>
      <Text style={styles.subtitle}>{t.paywall.subtitle}</Text>

      {options === null ? <ActivityIndicator color={colors.accent} /> : null}
      {options !== null && options.length === 0 ? <Text style={styles.note}>{t.paywall.unavailable}</Text> : null}

      {options?.map((o) => (
        <Pressable key={o.kind} onPress={() => setSelected(o)} style={[styles.option, selected?.kind === o.kind && styles.optionOn]}>
          <View style={styles.flex}>
            <Text style={styles.optionTitle}>{o.kind === "yearly" ? t.paywall.yearly : t.paywall.monthly}</Text>
            {o.hasTrial ? <Text style={styles.trial}>{t.paywall.trial}</Text> : null}
          </View>
          <Text style={styles.price}>
            {o.price} {o.kind === "yearly" ? t.paywall.perYear : t.paywall.perMonth}
          </Text>
        </Pressable>
      ))}

      {options && options.length > 0 ? (
        <Pressable style={[styles.cta, busy && styles.dim]} disabled={busy} onPress={() => void buy()}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>{t.paywall.cta}</Text>}
        </Pressable>
      ) : null}

      {billingAvailable ? (
        <Pressable onPress={() => void doRestore()} disabled={busy}>
          <Text style={styles.restore}>{t.paywall.restore}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.terms}>{t.paywall.terms}</Text>
      <View style={styles.legalRow}>
        <Pressable onPress={() => void Linking.openURL(legalUrl(API_URL, "terms", language))}>
          <Text style={styles.restore}>{t.paywall.termsLink}</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL(legalUrl(API_URL, "privacy", language))}>
          <Text style={styles.restore}>{t.paywall.privacyLink}</Text>
        </Pressable>
      </View>
      <Text style={styles.terms}>{t.settings.aiDisclosure}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  legalRow: { flexDirection: "row", justifyContent: "center", gap: 24 },
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, gap: 14 },
  title: { fontSize: 24, fontWeight: "700", color: colors.text, textAlign: "center" },
  subtitle: { fontSize: 16, color: colors.muted, textAlign: "center", marginBottom: 8 },
  note: { color: colors.muted, textAlign: "center" },
  option: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 2, borderColor: "transparent" },
  optionOn: { borderColor: colors.accent },
  flex: { flex: 1 },
  optionTitle: { fontSize: 17, fontWeight: "600", color: colors.text, textAlign: "left" },
  trial: { color: colors.ok, marginTop: 2, textAlign: "left" },
  price: { fontSize: 15, color: colors.text },
  cta: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 16, alignItems: "center", marginTop: 6 },
  dim: { opacity: 0.6 },
  ctaText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  restore: { color: colors.accent, textAlign: "center", fontWeight: "600" },
  terms: { color: colors.muted, fontSize: 12, textAlign: "center" },
});
