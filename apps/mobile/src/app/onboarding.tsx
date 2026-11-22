import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { appleAvailable, authAvailable, googleAvailable, phoneAvailable, sendCode, signInWithApple, signInWithGoogle, verifyCode } from "@/auth";
import { parseContact } from "@/auth/contact";
import { language, t } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { reloadApp } from "@/lib/reload";
import { colors } from "@/lib/theme";

/**
 * F1 (under 2 minutes): pick a language, sign in with a code sent by email or SMS, Apple or Google.
 * No tutorial screens — afterwards the friend opens the chat and asks your name.
 */
export default function OnboardingScreen() {
  const [step, setStep] = useState<"language" | "signin">(prefs.get("language") ? "signin" : "language");
  const [contactText, setContactText] = useState("");
  const parsed = parseContact(contactText);
  const contact = parsed?.kind === "phone" && !phoneAvailable ? null : parsed;
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const finish = () => {
    prefs.set("onboarded", "1");
    prefs.set("offer_tracker", "1");
    router.replace("/");
  };

  const run = async (fn: () => Promise<void>, then?: () => void) => {
    setBusy(true);
    try {
      await fn();
      then ? then() : finish();
    } catch (err) {
      // Supabase limits how often a sign-in email can be sent (once a minute per address, and
      // a small hourly total on the built-in mailer). That is "wait", not "something broke".
      const e = err as { status?: number; code?: string };
      const limited = e?.status === 429 || (typeof e?.code === "string" && e.code.includes("rate_limit"));
      Alert.alert(limited ? t.onboarding.tooSoon : t.onboarding.failed);
    } finally {
      setBusy(false);
    }
  };

  const pickLanguage = (lang: "ar-EG" | "en") => {
    prefs.set("language", lang);
    // Switching language (and RTL) needs a reload; the app reopens on the sign-in step.
    if (lang !== language) void reloadApp();
    else setStep("signin");
  };

  if (step === "language") {
    return (
      <View style={styles.page}>
        <Text style={styles.title}>{t.onboarding.pickLanguage}</Text>
        <Pressable style={styles.primary} onPress={() => pickLanguage("ar-EG")}>
          <Text style={styles.primaryText}>{t.onboarding.arabic}</Text>
        </Pressable>
        <Pressable style={styles.primary} onPress={() => pickLanguage("en")}>
          <Text style={styles.primaryText}>{t.onboarding.english}</Text>
        </Pressable>
        <Text style={styles.disclosure}>{t.settings.aiDisclosure}</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>{t.onboarding.signInTitle}</Text>
      {!authAvailable ? <Text style={styles.note}>{t.onboarding.notConfigured}</Text> : null}
      {authAvailable ? (
        <>
          <TextInput
            style={styles.input}
            value={contactText}
            onChangeText={(v) => {
              setContactText(v);
              setCodeSent(false);
            }}
            placeholder={phoneAvailable ? t.onboarding.contact : t.onboarding.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textAlign="left"
          />
          {codeSent && contact ? (
            <>
              {contact.kind === "email" ? <Text style={styles.note}>{t.onboarding.codeSentEmail}</Text> : null}
              <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder={t.onboarding.code} keyboardType="number-pad" autoComplete="one-time-code" maxLength={8} textAlign="center" />
              <Pressable style={[styles.primary, code.trim().length < 6 && styles.dim]} disabled={busy || code.trim().length < 6} onPress={() => void run(() => verifyCode(contact, code.trim()))}>
                <Text style={styles.primaryText}>{t.onboarding.verify}</Text>
              </Pressable>
            </>
          ) : null}
          {!codeSent ? (
            <Pressable style={[styles.primary, !contact && styles.dim]} disabled={busy || !contact} onPress={() => contact && void run(() => sendCode(contact), () => setCodeSent(true))}>
              <Text style={styles.primaryText}>{t.onboarding.sendCode}</Text>
            </Pressable>
          ) : null}
          {appleAvailable ? (
            <Pressable style={styles.secondary} disabled={busy} onPress={() => void run(signInWithApple)}>
              <Text style={styles.secondaryText}>{t.onboarding.apple}</Text>
            </Pressable>
          ) : null}
          {googleAvailable ? (
            <Pressable style={styles.secondary} disabled={busy} onPress={() => void run(signInWithGoogle)}>
              <Text style={styles.secondaryText}>{t.onboarding.google}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
      {busy ? <ActivityIndicator color={colors.accent} /> : null}
      <Pressable onPress={finish} style={styles.skip}>
        <Text style={styles.skipText}>{authAvailable ? t.onboarding.skip : t.onboarding.start}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, padding: 24, gap: 14, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", color: colors.text, textAlign: "center", marginBottom: 8 },
  note: { color: colors.muted, textAlign: "center" },
  disclosure: { color: colors.muted, textAlign: "center", marginTop: 12 },
  input: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: colors.text },
  primary: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  dim: { opacity: 0.5 },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  secondary: { borderWidth: 1, borderColor: colors.text, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  secondaryText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  skip: { alignItems: "center", paddingVertical: 8 },
  skipText: { color: colors.muted, fontSize: 15 },
});
