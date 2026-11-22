import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { billingAvailable, getPlanOptions, purchase, restore, type PlanOption } from "@/billing";
import { isFamily, isYearly } from "@/billing/options";
import { language, t } from "@/i18n";
import { legalUrl } from "@/lib/api-url";
import { API_URL } from "@/lib/api";
import { Badge, Button, Icon, notify, palette, plain, radius, Screen, shadow, space, Text, ZakiAvatar } from "@/ui";

/** Zaki Pro, Family and the founders' offer. Prices come from the store (regional pricing). */
export default function PaywallScreen() {
  const [options, setOptions] = useState<PlanOption[] | null>(null);
  const [selected, setSelected] = useState<PlanOption | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = Platform.OS === "web";

  useEffect(() => {
    if (!billingAvailable && !preview) return setOptions([]);
    getPlanOptions()
      .then((opts) => {
        setOptions(opts);
        setSelected(opts.find((o) => o.kind === "pro_yearly") ?? opts[0] ?? null);
      })
      .catch(() => setOptions([]));
  }, [preview]);

  const buy = async () => {
    if (!selected) return;
    if (preview) return notify(t.ui.demoPurchase, "info");
    setBusy(true);
    try {
      if (await purchase(selected)) router.back();
    } catch (err) {
      if (!(err as { userCancelled?: boolean }).userCancelled) notify(t.paywall.failed, "error");
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    setBusy(true);
    try {
      if (await restore()) router.back();
      else notify(t.paywall.nothingToRestore, "info");
    } catch {
      notify(t.paywall.failed, "error");
    } finally {
      setBusy(false);
    }
  };

  const point = (text: string) => (
    <View key={text} style={styles.point}>
      <Icon name="checkmark-circle" size={20} color={palette.ok} />
      <Text variant="body" style={styles.flex}>
        {text}
      </Text>
    </View>
  );

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.hero}>
        <ZakiAvatar size={72} glow />
        <Text variant="display" align="center">
          {plain(t.paywall.title)}
        </Text>
        <Text variant="body" color={palette.inkSoft} align="center">
          {t.paywall.subtitle}
        </Text>
      </View>
      <View style={styles.points}>{[t.ui.proPoint1, t.ui.proPoint2, t.ui.proPoint3, t.ui.proPoint4].map(point)}</View>

      {options === null ? <ActivityIndicator color={palette.primary} /> : null}
      {options !== null && options.length === 0 ? (
        <Text variant="small" color={palette.inkSoft} align="center">
          {t.paywall.unavailable}
        </Text>
      ) : null}

      {options?.map((o) => {
        const on = selected?.kind === o.kind;
        return (
          <Pressable key={o.kind} onPress={() => setSelected(o)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.option, on && styles.optionOn]}>
            <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
            <View style={styles.flex}>
              <View style={styles.optionHead}>
                <Text variant="bodyStrong">{t.paywall.plans[o.kind]}</Text>
                {o.kind === "pro_yearly" ? <Badge label={t.ui.bestValue} tone="primary" /> : null}
              </View>
              {o.kind === "founders" ? (
                <Text variant="small" color={palette.ok}>
                  {t.paywall.foundersNote}
                </Text>
              ) : null}
              {isFamily(o.kind) ? (
                <Text variant="small" color={palette.inkSoft}>
                  {t.paywall.familyNote}
                </Text>
              ) : null}
              {o.hasTrial ? (
                <Text variant="small" color={palette.ok}>
                  {t.paywall.trial}
                </Text>
              ) : null}
            </View>
            <View style={styles.price}>
              <Text variant="headline">{o.price}</Text>
              <Text variant="caption" color={palette.inkSoft}>
                {isYearly(o.kind) ? t.paywall.perYear : t.paywall.perMonth}
              </Text>
            </View>
          </Pressable>
        );
      })}

      {options && options.length > 0 ? <Button label={selected?.hasTrial ? t.paywall.ctaTrial : t.paywall.cta} size="lg" block busy={busy} icon="sparkles" onPress={() => void buy()} /> : null}
      <Text variant="caption" color={palette.inkSoft} align="center">
        {t.ui.planNote}
      </Text>

      {billingAvailable ? <Button label={t.paywall.restore} kind="text" size="sm" disabled={busy} onPress={() => void doRestore()} style={styles.center} /> : null}
      <Text variant="caption" color={palette.inkFaint} align="center">
        {t.paywall.terms}
      </Text>
      <View style={styles.legalRow}>
        <Button label={t.paywall.termsLink} kind="text" size="sm" onPress={() => void Linking.openURL(legalUrl(API_URL, "terms", language))} />
        <Button label={t.paywall.privacyLink} kind="text" size="sm" onPress={() => void Linking.openURL(legalUrl(API_URL, "privacy", language))} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { padding: space.xl, gap: space.md, maxWidth: 560, width: "100%", alignSelf: "center" },
  hero: { alignItems: "center", gap: space.sm },
  points: { gap: space.sm, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.sm },
  point: { flexDirection: "row", alignItems: "center", gap: space.sm },
  option: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: 2, borderColor: "transparent", ...shadow.card },
  optionOn: { borderColor: palette.primary, backgroundColor: "#FFFAF6" },
  optionHead: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: palette.lineStrong, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: palette.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.primary },
  price: { alignItems: "flex-end" },
  center: { alignSelf: "center" },
  legalRow: { flexDirection: "row", justifyContent: "center", gap: space.sm },
});
