import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { t } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { Choice, Field, FieldGroup, MeInput, SwitchRow } from "@/me/parts";
import { useMe } from "@/me/useMe";
import { notify, Screen, space } from "@/ui";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Zaki and me: what he calls her, how he talks, and the rhythm of her day. */
export default function ZakiAndMeScreen() {
  const m = t.lay.me;
  const { user, save } = useMe((u) => {
    setName(u.name ?? "");
    setWake(u.wake_time);
    setSleep(u.sleep_time);
  });
  const [name, setName] = useState(user?.name ?? "");
  const [wake, setWake] = useState(user?.wake_time ?? "");
  const [sleep, setSleep] = useState(user?.sleep_time ?? "");

  const saveName = () => {
    const next = name.trim() || null;
    if (user && next === user.name) return;
    void save({ name: next });
  };

  const saveTimes = () => {
    if (!TIME_RE.test(wake) || !TIME_RE.test(sleep)) return notify(t.settings.invalidTime, "error");
    if (user && wake === user.wake_time && sleep === user.sleep_time) return;
    void save({ wake_time: wake, sleep_time: sleep });
  };

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: m.zaki }} />

      <FieldGroup title={m.aboutYou}>
        <Field label={t.settings.name} first>
          <MeInput value={name} onChangeText={setName} onEnd={saveName} />
        </Field>
        <Field label={t.settings.addressAs}>
          <Choice
            value={user?.gender ?? ""}
            onChange={(v) => void save({ gender: v || null })}
            options={[
              { key: "female", label: t.settings.female },
              { key: "male", label: t.settings.male },
            ]}
          />
        </Field>
      </FieldGroup>

      <FieldGroup title={m.howZakiTalks}>
        <Field label={t.settings.tone} first>
          <Choice
            value={user?.tone ?? "balanced"}
            onChange={(v) => void save({ tone: v })}
            options={[
              { key: "playful", label: t.settings.playful },
              { key: "balanced", label: t.settings.balanced },
              { key: "calm", label: t.settings.calm },
            ]}
          />
        </Field>
        <SwitchRow
          label={m.direct}
          value={user?.always_direct ?? false}
          onChange={(v) => {
            prefs.set("always_direct", v ? "1" : "0");
            void save({ always_direct: v });
          }}
        />
      </FieldGroup>

      <FieldGroup title={m.yourDay}>
        <View style={styles.times}>
          <Field label={t.settings.wake} first>
            <MeInput value={wake} onChangeText={setWake} onEnd={saveTimes} keyboardType="numbers-and-punctuation" maxLength={5} style={styles.time} />
          </Field>
          <Field label={t.settings.sleep} first>
            <MeInput value={sleep} onChangeText={setSleep} onEnd={saveTimes} keyboardType="numbers-and-punctuation" maxLength={5} style={styles.time} />
          </Field>
        </View>
        <Field label={t.settings.checkins}>
          <Choice
            value={user?.checkin_interval_h ?? "2"}
            onChange={(v) => void save({ checkin_interval_h: v })}
            options={[
              { key: "2", label: t.settings.every2 },
              { key: "4", label: t.settings.every4 },
              { key: "off", label: t.settings.off },
            ]}
          />
        </Field>
      </FieldGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  times: { flexDirection: "row", gap: space.lg },
  time: { width: 110, textAlign: "center" },
});
