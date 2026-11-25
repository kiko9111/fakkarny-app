import { useEffect, useState } from "react";
import { StyleSheet, Switch, View } from "react-native";
import * as Device from "expo-device";
import * as Network from "expo-network";
import { t } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { Button, confirm, notify, palette, space, Text } from "@/ui";
import { CHAT_MODELS, ramGb, sizeLabel, type PhoneModel, type VoiceModel } from "./catalog";
import { cancelDownload, downloadsChanged, downloadState, startDownload } from "./downloads";
import { selectedModel, unloadBrain, warmBrain } from "./engine";
import { removeModel } from "./files";
import { brainAvailable, voiceAvailable } from "./native";
import { voiceModel } from "@/voice/engine";

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/** Re-render whenever a download moves. */
function useDownloads() {
  const [, bump] = useState(0);
  useEffect(() => downloadsChanged.subscribe(() => bump((n) => n + 1)), []);
}

/** Wi-Fi first: a 1.3 GB download on mobile data is a nasty surprise. */
async function onWifiOrAsk(size: number, go: () => void) {
  const net = await Network.getNetworkStateAsync().catch(() => null);
  if (net?.type === Network.NetworkStateType.WIFI) return go();
  confirm(fill(t.brain.wifi, { size: sizeLabel(size) }), fill(t.brain.download, { size: sizeLabel(size) }), go);
}

function DownloadRow({ model }: { model: PhoneModel | VoiceModel }) {
  useDownloads();
  const st = downloadState(model.id, model.bytes);
  if (st.status === "done") {
    return (
      <View style={styles.row}>
        <Text variant="small" color={palette.primaryInk} style={styles.flex}>
          {t.brain.ready}
        </Text>
        <Button
          label={t.brain.remove}
          size="sm"
          kind="text"
          onPress={() =>
            confirm(t.brain.removeAsk, t.brain.remove, () => {
              void unloadBrain().then(() => removeModel(model.id));
              downloadsChanged.emit(model.id);
            })
          }
        />
      </View>
    );
  }
  if (st.status === "downloading") {
    return (
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text variant="small">{fill(t.brain.downloading, { pct: Math.round(st.fraction * 100) })}</Text>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${Math.round(st.fraction * 100)}%` }]} />
          </View>
        </View>
        <Button label={t.brain.cancel} size="sm" kind="text" onPress={() => cancelDownload(model.id)} />
      </View>
    );
  }
  return (
    <View style={styles.row}>
      {st.status === "paused" ? (
        <Text variant="small" color={palette.inkSoft} style={styles.flex}>
          {fill(t.brain.paused, { pct: Math.round(st.fraction * 100) })}
        </Text>
      ) : (
        <View style={styles.flex} />
      )}
      <Button
        label={st.status === "paused" ? t.brain.resume : fill(t.brain.download, { size: sizeLabel(model.bytes) })}
        size="sm"
        kind="tonal"
        icon="cloud-download-outline"
        onPress={() =>
          void onWifiOrAsk(model.bytes, () => {
            startDownload(model.id, model.url, model.bytes)
              .then(() => warmBrain())
              .catch(() => {});
          })
        }
      />
    </View>
  );
}

/** "Zaki's brain (test)": cloud or on this phone, which model, its download. Android builds with llama.rn only. */
export function BrainSection() {
  useDownloads();
  const [mode, setMode] = useState(prefs.get("brain") === "phone" ? "phone" : "cloud");
  const [modelId, setModelId] = useState(selectedModel().id);
  const [fallback, setFallback] = useState(prefs.get("brain_fallback") !== "0");
  if (!brainAvailable) {
    return (
      <Text variant="small" color={palette.inkSoft}>
        {t.brain.notInBuild}
      </Text>
    );
  }
  const ram = ramGb(Device.totalMemory);
  const model = CHAT_MODELS.find((m) => m.id === modelId) ?? selectedModel();
  const lastMs = Number(prefs.get("brain_last_ms") ?? 0);
  const lastWait = Number(prefs.get("reply_last_ms") ?? 0);

  const pickMode = (v: "cloud" | "phone") => {
    setMode(v);
    prefs.set("brain", v);
    if (v === "phone") warmBrain();
    else void unloadBrain();
  };
  const pickModel = (m: PhoneModel) => {
    if (ram !== null && ram < m.minRamGb) notify(fill(t.brain.lowRam, { ram, need: m.minRamGb }), "info");
    setModelId(m.id);
    prefs.set("brain_model", m.id);
    void unloadBrain().then(warmBrain);
  };

  return (
    <View style={styles.wrap}>
      <Text variant="small" color={palette.inkSoft}>
        {t.brain.intro}
      </Text>
      <View style={styles.choices}>
        <Button label={t.brain.cloud} size="sm" kind={mode === "cloud" ? "filled" : "outline"} icon="cloud-outline" onPress={() => pickMode("cloud")} />
        <Button label={t.brain.phone} size="sm" kind={mode === "phone" ? "filled" : "outline"} icon="phone-portrait-outline" onPress={() => pickMode("phone")} />
      </View>
      {lastWait > 0 ? (
        <Text variant="caption" color={palette.inkSoft}>
          {fill(t.brain.lastWait, { s: (lastWait / 1000).toFixed(1) })}
        </Text>
      ) : null}
      {mode === "phone" ? (
        <>
          <Text variant="bodyStrong">{t.brain.model}</Text>
          <View style={styles.choices}>
            {CHAT_MODELS.map((m) => (
              <Button key={m.id} label={`${m.tier === "small" ? t.brain.small : t.brain.balanced} · ${sizeLabel(m.bytes)}`} size="sm" kind={m.id === model.id ? "filled" : "outline"} onPress={() => pickModel(m)} />
            ))}
          </View>
          <DownloadRow model={model} />
          {lastMs > 0 ? (
            <Text variant="caption" color={palette.inkSoft}>
              {fill(t.brain.lastReply, { s: (lastMs / 1000).toFixed(1) })}
            </Text>
          ) : null}
          <View style={styles.row}>
            <Text variant="small" style={styles.flex}>
              {t.brain.fallback}
            </Text>
            <Switch
              value={fallback}
              trackColor={{ true: palette.primary, false: palette.lineStrong }}
              thumbColor={palette.surfaceSolid}
              onValueChange={(v) => {
                setFallback(v);
                prefs.set("brain_fallback", v ? "1" : "0");
              }}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

/** "Voice typing": what it does and its one-time download. */
export function VoiceSection() {
  if (!voiceAvailable()) {
    return (
      <Text variant="small" color={palette.inkSoft}>
        {t.brain.notInBuild}
      </Text>
    );
  }
  return (
    <View style={styles.wrap}>
      <Text variant="small" color={palette.inkSoft}>
        {t.voice.intro}
      </Text>
      <DownloadRow model={voiceModel()} />
    </View>
  );
}

/** Whether to show these sections at all (Android builds made after 2026-11-25). */
export const showBrainSettings = () => brainAvailable || voiceAvailable();

const styles = StyleSheet.create({
  wrap: { gap: space.sm, paddingVertical: space.md },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  track: { height: 6, borderRadius: 3, backgroundColor: palette.lineStrong, marginTop: 6, overflow: "hidden" },
  bar: { height: 6, borderRadius: 3, backgroundColor: palette.primary },
});
