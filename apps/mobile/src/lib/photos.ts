import { requireOptionalNativeModule } from "expo";
import { MAX_PHOTO_B64, type PhotoUpload } from "@fakkarni/shared";

/**
 * Photos for receipts and homework only (owner decision, 2026-11-23). Optional: builds made
 * before expo-image-picker was added still take JavaScript updates over the air, so the photo
 * buttons only show when the native modules exist. Each photo is shrunk to 1600px wide JPEG
 * before it leaves the phone. Permission is asked on tap, never before.
 */
export const photosAvailable = requireOptionalNativeModule("ExponentImagePicker") != null && requireOptionalNativeModule("ExpoImageManipulator") != null;

export type PickPhotos = { photos: PhotoUpload[] } | { denied: true } | { tooBig: true } | null;

const MAX_SIDE = 1600;

async function shrink(uri: string, width: number, height: number): Promise<PhotoUpload | null> {
  const { ImageManipulator, SaveFormat } = require("expo-image-manipulator") as typeof import("expo-image-manipulator");
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_SIDE) ctx.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  return out.base64 ? { mime: "image/jpeg", data: out.base64 } : null;
}

/** Camera or library. `max` > 1 lets the library pick several (homework pages). */
export async function pickPhotos(source: "camera" | "library", max = 1): Promise<PickPhotos> {
  if (!photosAvailable) return null;
  const ImagePicker = require("expo-image-picker") as typeof import("expo-image-picker");
  const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { denied: true };
  const options = { mediaTypes: ["images"] as import("expo-image-picker").MediaType[], quality: 1, allowsMultipleSelection: source === "library" && max > 1, selectionLimit: max };
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets.length) return null;
  const photos: PhotoUpload[] = [];
  for (const a of result.assets.slice(0, max)) {
    const p = await shrink(a.uri, a.width, a.height);
    if (!p) continue;
    if (p.data.length > MAX_PHOTO_B64) return { tooBig: true };
    photos.push(p);
  }
  return photos.length ? { photos } : null;
}
