import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { appleAvailable, authAvailable, googleAvailable, phoneAvailable, sendCode, signInWithApple, signInWithGoogle, verifyCode } from "@/auth";
import { parseContact } from "@/auth/contact";
import { language, t } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { unlock } from "@/lib/unlock-store";
import { reloadApp } from "@/lib/reload";
import { Button, fonts, Icon, notify, palette, radius, space, Text, ZakiAvatar, ThemePicker, type IconName } from "@/ui";

/**
 * F1 (under 2 minutes): meet Zaki and pick a language, then sign in with a code sent by email
 * or SMS, Apple or Google. Afterwards the friend opens the chat and asks your name.
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
    // Chat first: a new user starts with Zaki only; the rest opens as it's needed.
    unlock.startFresh();
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
      notify(limited ? t.onboarding.tooSoon : t.onboarding.failed, "error");
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
    const point = (icon: IconName, text: string) => (
      <View style={styles.point}>
        <View style={styles.pointIcon}>
          <Icon name={icon} size={20} color={palette.primaryInk} />
        </View>
        <Text variant="body" style={styles.flex}>
          {text}
        </Text>
      </View>
    );
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <ZakiAvatar size={104} glow />
          <Text variant="display" align="center">
            {t.ui.welcomeTitle}
          </Text>
          <Text variant="body" color={palette.inkSoft} align="center" style={styles.lead}>
            {t.ui.welcomeBody}
          </Text>
        </View>
        <View style={styles.points}>
          {point("chatbubble-ellipses-outline", t.ui.welcomePoint1)}
          {point("alarm-outline", t.ui.welcomePoint2)}
          {point("sparkles-outline", t.ui.welcomePoint3)}
        </View>
        <Text variant="smallStrong" color={palette.inkSoft} align="center">
          {t.ui.themeTitle}
        </Text>
        <ThemePicker />
        <Text variant="smallStrong" color={palette.inkSoft} align="center">
          {t.onboarding.pickLanguage}
        </Text>
        <View style={styles.langs}>
          <Button label={t.onboarding.arabic} size="lg" block kind={language === "ar-EG" ? "filled" : "outline"} onPress={() => pickLanguage("ar-EG")} />
          <Button label={t.onboarding.english} size="lg" block kind={language === "en" ? "filled" : "outline"} onPress={() => pickLanguage("en")} />
        </View>
        <Text variant="caption" color={palette.inkSoft} align="center">
          {t.settings.aiDisclosure}
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <ZakiAvatar size={72} glow />
        <Text variant="title" align="center">
          {t.onboarding.signInTitle}
        </Text>
        <Text variant="small" color={palette.inkSoft} align="center">
          {authAvailable ? t.ui.signInLine : t.onboarding.notConfigured}
        </Text>
      </View>
      {authAvailable ? (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={contactText}
            onChangeText={(v) => {
              setContactText(v);
              setCodeSent(false);
            }}
            placeholder={phoneAvailable ? t.onboarding.contact : t.onboarding.email}
            placeholderTextColor={palette.inkFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textAlign="left"
          />
          {codeSent && contact ? (
            <>
              {contact.kind === "email" ? (
                <Text variant="small" color={palette.inkSoft} align="center">
                  {t.onboarding.codeSentEmail}
                </Text>
              ) : null}
              <TextInput style={[styles.input, styles.code]} value={code} onChangeText={setCode} placeholder={t.onboarding.code} placeholderTextColor={palette.inkFaint} keyboardType="number-pad" autoComplete="one-time-code" maxLength={8} textAlign="center" />
              <Button label={t.onboarding.verify} size="lg" block disabled={busy || code.trim().length < 6} onPress={() => void run(() => verifyCode(contact, code.trim()))} />
            </>
          ) : (
            <Button label={t.onboarding.sendCode} size="lg" block disabled={busy || !contact} onPress={() => contact && void run(() => sendCode(contact), () => setCodeSent(true))} />
          )}
          {googleAvailable ? <Button label={t.onboarding.google} kind="outline" icon="logo-google" size="lg" block disabled={busy} onPress={() => void run(signInWithGoogle)} /> : null}
          {appleAvailable ? <Button label={t.onboarding.apple} kind="outline" icon="logo-apple" size="lg" block disabled={busy} onPress={() => void run(signInWithApple)} /> : null}
        </View>
      ) : null}
      {busy ? <ActivityIndicator color={palette.primary} /> : null}
      <Button label={authAvailable ? t.onboarding.skip : t.onboarding.start} kind={authAvailable ? "text" : "filled"} size="lg" block={!authAvailable} icon={authAvailable ? undefined : "arrow-forward"} onPress={finish} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: palette.bg },
  content: { flexGrow: 1, justifyContent: "center", padding: space.xl, gap: space.xl, maxWidth: 520, width: "100%", alignSelf: "center" },
  hero: { alignItems: "center", gap: space.md },
  lead: { maxWidth: 360 },
  points: { gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg },
  point: { flexDirection: "row", alignItems: "center", gap: space.md },
  pointIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  langs: { gap: space.sm },
  form: { gap: space.md },
  input: { minHeight: 54, backgroundColor: palette.surface, borderRadius: radius.md, borderWidth: 1, borderColor: palette.line, paddingHorizontal: space.lg, fontSize: 17, fontFamily: fonts.body, color: palette.ink },
  code: { fontSize: 24, fontFamily: fonts.display },
});
