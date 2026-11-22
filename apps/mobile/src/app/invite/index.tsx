import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack } from "expo-router";
import { inviteCodeFromText } from "@fakkarni/shared";
import { t } from "@/i18n";
import { Button, IconTile, palette, plain, Screen, space, Text, TextField } from "@/ui";

/** "I have an invite": paste the WhatsApp link or type the code from the web page. */
export default function EnterInviteScreen() {
  const [text, setText] = useState("");
  const code = inviteCodeFromText(text);
  const go = () => code && router.replace({ pathname: "/invite/[code]", params: { code } });

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.circles.codeTitle }} />
      <View style={styles.hero}>
        <IconTile name="ticket-outline" size={64} />
        <Text variant="body" color={palette.inkSoft} align="center">
          {plain(t.circles.codeHint)}
        </Text>
      </View>
      <TextField big value={text} onChangeText={setText} placeholder={t.circles.codePlaceholder} autoCapitalize="characters" autoCorrect={false} autoFocus textAlign="center" returnKeyType="go" onSubmitEditing={go} />
      <Button label={t.circles.next} size="lg" block disabled={!code} onPress={go} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg },
  hero: { alignItems: "center", gap: space.md, marginTop: space.sm },
});
