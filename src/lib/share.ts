import { Share } from 'react-native';

/**
 * Opens the share sheet. Browsers without one (most desktops) copy `copyText` to the clipboard
 * instead. Resolves true when the text was copied, so the caller can say so.
 */
export async function shareOrCopy(message: string, copyText = message): Promise<boolean> {
  try {
    await Share.share({ message });
    return false;
  } catch (err) {
    if ((err as Error)?.name === 'AbortError' || typeof navigator === 'undefined' || !navigator.clipboard) return false;
    return navigator.clipboard.writeText(copyText).then(
      () => true,
      () => false,
    );
  }
}
