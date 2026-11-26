import { StyleSheet, View } from "react-native";
import { MAX_HELP_PHOTOS, type PhotoUpload } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t } from "@/i18n";
import { photosAvailable, pickPhotos } from "@/lib/photos";
import { Button, notify, palette, space, Text } from "@/ui";

/**
 * Book pages or answers to photograph for Zaki (read once on the server, never kept). Shown only
 * in builds that have the photo picker (optional native code, builds after 2026-11-23).
 */
export function PagePhotos({ photos, onChange, disabled }: { photos: PhotoUpload[]; onChange: (next: PhotoUpload[]) => void; disabled?: boolean }) {
  if (!photosAvailable) return null;
  const room = MAX_HELP_PHOTOS - photos.length;
  const add = async (source: "camera" | "library") => {
    if (room <= 0) return;
    try {
      const picked = await pickPhotos(source, room);
      if (!picked) return;
      if ("denied" in picked) return notify(t.receipt.denied);
      if ("tooBig" in picked) return notify(t.receipt.tooBig);
      onChange([...photos, ...picked.photos].slice(0, MAX_HELP_PHOTOS));
    } catch {
      notify(t.tasks.failed, "error");
    }
  };
  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Button label={t.homework.photoCamera} size="sm" kind="tonal" icon="camera-outline" disabled={disabled || room <= 0} onPress={() => void add("camera")} />
        <Button label={t.homework.photoLibrary} size="sm" kind="text" icon="images-outline" disabled={disabled || room <= 0} onPress={() => void add("library")} />
        {photos.length ? <Button label={t.ui.cancel} size="sm" kind="text" icon="close" disabled={disabled} onPress={() => onChange([])} /> : null}
      </View>
      <Text variant="caption" color={palette.inkSoft}>
        {photos.length ? `${fill(t.homework.photosPicked, { n: photos.length })} · ` : ""}
        {t.homework.photosNote}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.xs },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
