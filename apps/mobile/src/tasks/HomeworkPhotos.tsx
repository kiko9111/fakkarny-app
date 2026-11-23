import { useEffect, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, View } from "react-native";
import { t } from "@/i18n";
import { photoSource } from "@/lib/api";
import { palette, radius, space, Text } from "@/ui";

type Source = { uri: string; headers: Record<string, string> };

/**
 * The pages a child handed in, for the child and the parent who set the homework only (the server
 * checks). Tap a page to see it full size. A page past its 90 days is gone on the server.
 */
export function HomeworkPhotos({ ids }: { ids: string[] }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [open, setOpen] = useState<Source | null>(null);
  const [gone, setGone] = useState<Record<string, true>>({});
  const key = ids.join(",");
  useEffect(() => {
    let live = true;
    Promise.all(ids.map((id) => photoSource(id)))
      .then((s) => live && setSources(s))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!sources.length) return null;
  return (
    <View style={styles.wrap}>
      <Text variant="caption" color={palette.inkSoft}>
        {t.tasks.photosLabel}
      </Text>
      <View style={styles.row}>
        {sources.map((s) =>
          gone[s.uri] ? (
            <View key={s.uri} style={[styles.thumb, styles.gone]}>
              <Text variant="caption" color={palette.inkFaint} align="center">
                {t.tasks.photoGone}
              </Text>
            </View>
          ) : (
            <Pressable key={s.uri} onPress={() => setOpen(s)} accessibilityRole="imagebutton" accessibilityLabel={t.tasks.photosLabel}>
              <Image source={s} style={styles.thumb} onError={() => setGone((g) => ({ ...g, [s.uri]: true }))} />
            </Pressable>
          ),
        )}
      </View>
      <Modal visible={open !== null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.full} onPress={() => setOpen(null)} accessibilityRole="button" accessibilityLabel={t.ui.cancel}>
          {open ? <Image source={open} style={styles.fullImage} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  thumb: { width: 72, height: 96, borderRadius: radius.md, backgroundColor: palette.surface },
  gone: { alignItems: "center", justifyContent: "center", padding: 4 },
  full: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center" },
  fullImage: { width: "100%", height: "90%" },
});
