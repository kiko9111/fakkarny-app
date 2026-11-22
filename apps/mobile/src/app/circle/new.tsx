import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { FamilyType } from "@fakkarni/shared";
import { t } from "@/i18n";
import { createCircle } from "@/lib/api";
import { Button, Chip, IconTile, notify, palette, Screen, space, Text, TextField } from "@/ui";

/** Name a new circle; it opens straight away so the next tap is "invite". */
export default function NewCircleScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = params.kind === "friends" ? "friends" : "family";
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [familyType, setFamilyType] = useState<FamilyType | null>(null);
  const ready = name.trim().length > 0;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const circle = await createCircle(kind, name.trim(), kind === "family" ? familyType : null);
      router.replace({ pathname: "/circle/[id]", params: { id: circle.id } });
    } catch {
      notify(t.circles.failed, "error");
      setBusy(false);
    }
  };

  const family = kind === "family";
  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: family ? t.circles.newTitleFamily : t.circles.newTitleFriends }} />
      <View style={styles.hero}>
        <IconTile name={family ? "home" : "people"} size={64} color={family ? palette.family : palette.friends} bg={family ? palette.familySoft : palette.friendsSoft} />
      </View>
      <TextField value={name} onChangeText={setName} placeholder={family ? t.circles.namePlaceholderFamily : t.circles.namePlaceholderFriends} maxLength={40} autoFocus returnKeyType="done" onSubmitEditing={() => void submit()} />
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
      <Button label={t.circles.create} size="lg" block busy={busy} disabled={!ready} onPress={() => void submit()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg },
  hero: { alignItems: "center", marginTop: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
