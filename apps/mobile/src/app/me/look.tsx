import { Stack } from "expo-router";
import { language, t } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { reloadApp } from "@/lib/reload";
import { Choice, Field, FieldGroup } from "@/me/parts";
import { useMe } from "@/me/useMe";
import { ask, Screen, ThemePicker } from "@/ui";

/** Look and language: the theme and the app's language. Either change reopens the app. */
export default function LookScreen() {
  const m = t.lay.me;
  const { save } = useMe();

  const changeLanguage = (lang: "ar-EG" | "en") => {
    if (lang === language) return;
    prefs.set("language", lang);
    void save({ language: lang });
    ask(t.settings.restart, undefined, [{ label: t.ui.ok, onPress: () => void reloadApp() }]);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: m.look }} />
      <FieldGroup>
        <Field label={m.theme} first>
          <ThemePicker />
        </Field>
        <Field label={t.settings.language}>
          <Choice
            value={language}
            onChange={changeLanguage}
            options={[
              { key: "ar-EG", label: t.onboarding.arabic },
              { key: "en", label: t.onboarding.english },
            ]}
          />
        </Field>
      </FieldGroup>
    </Screen>
  );
}
