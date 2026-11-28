import { useState } from "react";
import { StyleSheet } from "react-native";
import { router } from "expo-router";
import { markForwarded } from "@fakkarni/shared";
import { parkForward } from "@/forward/inbox";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { Button, notify, Screen, space, TextField } from "@/ui";

/**
 * "From WhatsApp" (the chat's "+"): paste a message from a school or family group and Zaki reads
 * it, the same as sharing it to Zaki on Android. Works on every phone and build, iPhone too.
 * The chat sends it (forward/inbox.ts); Zaki answers there with what he saved and any card.
 */
export default function ForwardScreen() {
  const [text, setText] = useState("");
  const send = () => {
    const marked = markForwarded(text);
    if (!marked) return notify(t.lay.chat.forwardEmpty);
    track("forward_in", { kind: "chat", source: "paste" });
    parkForward(marked);
    router.dismissTo("/");
  };
  return (
    <Screen keyboard contentStyle={styles.content}>
      <TextField value={text} onChangeText={setText} placeholder={t.lay.chat.forwardHint} maxLength={8000} multiline autoFocus style={styles.box} />
      <Button label={t.lay.chat.forwardSend} icon="send" size="lg" block disabled={!text.trim()} onPress={send} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  box: { minHeight: 180, textAlignVertical: "top" },
});
