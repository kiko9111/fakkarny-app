import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack } from "expo-router";
import { FamilyType } from "@fakkarni/shared";
import { t } from "@/i18n";
import { createCircle } from "@/lib/api";
import { Button, Chip, IconTile, Note, notify, palette, Screen, space, Text, TextField } from "@/ui";

type Idea = keyof typeof t.circles.ideas;
const IDEAS: Idea[] = ["family", "friends", "work", "gym", "study"];

/**
 * Name a new circle anything (work, gym, group 1…). Every circle gets every feature; "This is
 * family" only adds the family touches (roles, check-in order). It opens straight away so the
 * next tap is "invite".
 */
export default function NewCircleScreen() {
  const [name, setName] = useState("");
  const [family, setFamily] = useState(false);
  const [busy, setBusy] = useState(false);
  const [familyType, setFamilyType] = useState<FamilyType | null>(null);
  const ready = name.trim().length > 0;

  const pickIdea = (idea: Idea) => {
    setName(t.circles.ideas[idea]);
    setFamily(idea === "family");
  };

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const circle = await createCircle(family ? "family" : "friends", name.trim(), family ? familyType : null);
      router.replace({ pathname: "/circle/[id]", params: { id: circle.id } });
    } catch {
      notify(t.circles.failed, "error");
      setBusy(false);
    }
  };

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.circles.newTitle }} />
      <View style={styles.hero}>
        <IconTile name={family ? "home" : "people"} size={64} color={family ? palette.family : palette.primaryInk} bg={family ? palette.familySoft : palette.primarySoft} />
      </View>
      <TextField value={name} onChangeText={setName} placeholder={t.circles.namePlaceholder} maxLength={40} autoFocus returnKeyType="done" onSubmitEditing={() => void submit()} />
      <Text variant="smallStrong" color={palette.inkSoft}>
        {t.circles.ideasTitle}
      </Text>
      <View style={styles.row}>
        {IDEAS.map((idea) => (
          <Chip key={idea} label={t.circles.ideas[idea]} selected={name === t.circles.ideas[idea]} onPress={() => pickIdea(idea)} />
        ))}
      </View>
      <View style={styles.row}>
        <Chip label={t.circles.isFamily} icon="home-outline" tone="family" selected={family} onPress={() => setFamily(!family)} />
      </View>
      {family ? (
        <>
          <Text variant="smallStrong" color={palette.inkSoft}>
            {t.family.typeTitle}
          </Text>
          <View style={styles.row}>
            {FamilyType.options.map((ft) => (
              <Chip key={ft} label={t.family.types[ft]} tone="family" selected={familyType === ft} onPress={() => setFamilyType(familyType === ft ? null : ft)} />
            ))}
          </View>
          {familyType === "parents_teens" ? (
            <Text variant="small" color={palette.inkSoft}>
              {t.family.teenHint}
            </Text>
          ) : null}
        </>
      ) : null}
      <Note icon="gift-outline">{t.circles.trialNote}</Note>
      <Button label={t.circles.create} size="lg" block busy={busy} disabled={!ready} onPress={() => void submit()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg },
  hero: { alignItems: "center", marginTop: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
