import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack } from "expo-router";
import { parseInstapayLink } from "@fakkarni/shared";
import { dateLocale, t } from "@/i18n";
import { planLine, planNow } from "@/me/lines";
import { Field, FieldGroup, MeInput } from "@/me/parts";
import { useMe } from "@/me/useMe";
import { Button, Icon, notify, palette, Screen, space, Text } from "@/ui";

const longDate = (iso: string) => new Date(iso).toLocaleDateString(dateLocale, { day: "numeric", month: "long" });

/** Payments: the plan she is on, and her own InstaPay link for people who owe her. */
export default function PaymentsScreen() {
  const m = t.lay.me;
  const { user, save } = useMe((u) => setInstapay(u.instapay_link ?? ""));
  const [instapay, setInstapay] = useState(user?.instapay_link ?? "");

  const plan = planNow(user, new Date());
  const paid = user?.plan === "monthly" || user?.plan === "yearly";

  const saveInstapay = () => {
    const text = instapay.trim();
    if (text === (user?.instapay_link ?? "")) return;
    const link = text ? parseInstapayLink(text) : null;
    if (text && !link) return notify(t.daftar.instapayInvalid, "error");
    setInstapay(link ?? "");
    void save({ instapay_link: link });
  };

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: m.payments }} />

      <FieldGroup title={m.plan}>
        <View style={styles.plan}>
          <Icon name="sparkles" size={22} color={plan.kind === "free" ? palette.inkSoft : palette.primaryInk} />
          <Text variant="bodyStrong" style={styles.flex}>
            {planLine(plan, m, longDate)}
          </Text>
        </View>
        {paid ? null : (
          <View style={styles.planButton}>
            <Button label={t.circles.seePro} block onPress={() => router.push("/paywall")} />
          </View>
        )}
      </FieldGroup>

      <FieldGroup title={t.daftar.instapayLabel}>
        <Field first>
          <MeInput value={instapay} onChangeText={setInstapay} onEnd={saveInstapay} placeholder={t.daftar.instapayPlaceholder} autoCapitalize="none" autoCorrect={false} keyboardType="url" textAlign="left" />
          <Text variant="caption" color={palette.inkSoft}>
            {t.daftar.instapayHint}
          </Text>
        </Field>
      </FieldGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  plan: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, paddingVertical: space.sm },
  planButton: { paddingBottom: space.lg },
});
