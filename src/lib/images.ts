// Team logos and profile pictures: pick an image, shrink it, upload it to Supabase Storage, and
// build the public address to show it. Both buckets are public; file names are unguessable.
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { paletteFromPixels } from '../ui/color';
import { supabase } from './supabase';

export type ImageBucket = 'team-logos' | 'avatars';

export function imageUrl(bucket: ImageBucket, path: string | null | undefined): string | null {
  return path ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;
}

export interface PreparedImage {
  body: Blob | ArrayBuffer;
  contentType: string;
  ext: string;
  /** The image's main colours, most prominent first. Only worked out in the browser. */
  palette: string[];
}

/**
 * Opens the photo library. Must run straight from a tap: browsers block file pickers otherwise.
 * `square` crops profile pictures to a square; logos keep their shape.
 */
export async function pickImage({ square }: { square: boolean }): Promise<ImagePicker.ImagePickerAsset | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: square, aspect: [1, 1], quality: 0.9 });
  return result.canceled ? null : (result.assets[0] ?? null);
}

/**
 * In the browser, redraws the image at most `maxSize` pixels across (cropped to a square if asked)
 * and reads its colours. Logos stay PNG to keep transparent backgrounds; photos become JPEG.
 */
export async function prepareImage(asset: ImagePicker.ImagePickerAsset, { maxSize, square }: { maxSize: number; square: boolean }): Promise<PreparedImage> {
  if (Platform.OS !== 'web') {
    const contentType = asset.mimeType ?? 'image/jpeg';
    return { body: await (await fetch(asset.uri)).arrayBuffer(), contentType, ext: contentType.split('/')[1] ?? 'jpg', palette: [] };
  }
  const img = await loadImage(asset.uri);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const [sx, sy, sw, sh] = square
    ? [(img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side]
    : [0, 0, img.naturalWidth, img.naturalHeight];
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const contentType = square ? 'image/jpeg' : 'image/png';
  const body = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that image. Try a PNG or JPG.'))), contentType, 0.88),
  );
  return { body, contentType, ext: square ? 'jpg' : 'png', palette: square ? [] : samplePalette(img) };
}

/** The main colours of an image already online, such as a saved logo. Browser only; [] elsewhere or on failure. */
export async function paletteOfUrl(url: string): Promise<string[]> {
  if (Platform.OS !== 'web') return [];
  try {
    return samplePalette(await loadImage(url, true));
  } catch {
    return [];
  }
}

export async function uploadImage(bucket: ImageBucket, folder: string, image: PreparedImage): Promise<string> {
  const path = `${folder}/${Date.now()}.${image.ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, image.body, { contentType: image.contentType, cacheControl: '31536000', upsert: false });
  if (error) throw new Error(/exceeded|too large/i.test(error.message) ? 'That image is too big. Choose one under 2 MB.' : error.message);
  return path;
}

/** Deletes a replaced image. Best effort: a leftover file only costs a little storage. */
export function removeImage(bucket: ImageBucket, path: string | null | undefined): void {
  if (path) void supabase.storage.from(bucket).remove([path]).catch(() => undefined);
}

function loadImage(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not open that image. Try a PNG or JPG.'));
    img.src = src;
  });
}

function samplePalette(img: HTMLImageElement): string[] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, 64, 64);
  return paletteFromPixels(ctx.getImageData(0, 0, 64, 64).data);
}
