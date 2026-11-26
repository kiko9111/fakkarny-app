import { useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, TextInput, View } from "react-native";
import { language, t } from "@/i18n";
import { confirm, glass, fonts, IconButton, notify, palette, radius, shadow, space, textStart } from "@/ui";
import { voiceAvailable } from "@/brain/native";
import { sizeLabel } from "@/brain/catalog";
import { startDownload } from "@/brain/downloads";
import { micPermission, startListening, stopListening, voiceModel, voiceReady } from "@/voice/engine";

/**
 * The composer. Voice typing (Android builds from 2026-11-25): the mic writes what you say into the
 * box, on the phone, and you read it before sending. Audio is never saved or sent (CLAUDE.md).
 */
export function ChatInput({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<"idle" | "listening" | "working">("idle");
  const showMic = voiceAvailable();

  const mic = async () => {
    if (voice === "working") return;
    if (voice === "listening") {
      setVoice("working");
      try {
        const said = await stopListening(language === "en" ? "en" : "ar");
        if (said) setText((old) => (old.trim() ? `${old.trimEnd()} ${said}` : said));
        else notify(t.voice.nothing, "info");
      } catch {
        notify(t.voice.failed, "error");
      } finally {
        setVoice("idle");
      }
      return;
    }
    if (!voiceReady()) {
      const m = voiceModel();
      confirm(t.voice.needModel.replace("{size}", sizeLabel(m.bytes)), t.brain.download.replace("{size}", sizeLabel(m.bytes)), () => {
        notify(t.brain.downloading.replace("{pct}", "0"), "info");
        startDownload(m.id, m.url, m.bytes).catch(() => notify(t.brain.failed, "error"));
      });
      return;
    }
    if (!(await micPermission())) return notify(t.voice.denied, "error");
    try {
      await startListening();
      setVoice("listening");
    } catch {
      notify(t.voice.failed, "error");
    }
  };
  const canSend = text.trim().length > 0;
  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setText("");
  };

  return (
    <View style={styles.bar}>
      <View style={styles.field}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={voice === "listening" ? t.voice.listening : voice === "working" ? t.voice.working : t.chat.placeholder}
          placeholderTextColor={palette.inkFaint}
          multiline
          maxLength={4000}
          textAlign={textStart}
          accessibilityLabel={t.chat.placeholder}
          // The browser draws a text box two rows tall unless told; the phone sizes it to its text.
          {...(Platform.OS === "web" ? { rows: 1 } : null)}
          // The browser preview: Enter sends, Shift+Enter makes a new line.
          onKeyPress={
            Platform.OS === "web"
              ? (e) => {
                  const ev = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
                  if (ev.key === "Enter" && !ev.shiftKey) {
                    (e as unknown as { preventDefault: () => void }).preventDefault();
                    submit();
                  }
                }
              : undefined
          }
        />
        {showMic ? (
          voice === "working" ? (
            <View style={styles.spinner}>
              <ActivityIndicator color={palette.primary} />
            </View>
          ) : (
            <IconButton name={voice === "listening" ? "stop" : "mic-outline"} label={voice === "listening" ? t.voice.stop : t.voice.start} onPress={() => void mic()} color={voice === "listening" ? palette.onPrimary : palette.inkSoft} bg={voice === "listening" ? palette.danger : undefined} size={40} />
          )
        ) : null}
        <IconButton name="arrow-up" label={t.chat.send} onPress={submit} disabled={!canSend} color={palette.onPrimary} bg={canSend ? palette.primary : palette.lineStrong} size={40} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  spinner: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  bar: { paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.md, backgroundColor: "transparent" },
  field: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, ...glass, backgroundColor: palette.surfaceStrong, borderRadius: radius.xl, paddingStart: space.lg, paddingEnd: space.xs + 2, paddingVertical: space.xs + 2 },
  // `textAlign` in the style too: the browser ignores the prop, and an empty box then starts on the wrong side in Arabic.
  input: { flex: 1, minHeight: 40, maxHeight: 140, paddingTop: 9, paddingBottom: 9, fontSize: 16, lineHeight: 22, fontFamily: fonts.body, color: palette.ink, textAlign: textStart, outlineStyle: "none" } as object,
});
