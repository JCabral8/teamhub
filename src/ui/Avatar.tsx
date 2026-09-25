// Profile pictures and Team logos, with initials standing in when there's no image.
import { Image, StyleSheet, Text, View } from 'react-native';
import { imageUrl } from '../lib/images';
import { paletteFor, useAccent } from './accent';
import { colors } from './theme';

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase() || '?';
}

export function Avatar({ name, path, size = 32 }: { name: string; path: string | null | undefined; size?: number }) {
  const a = useAccent();
  const url = imageUrl('avatars', path);
  const frame = { width: size, height: size, borderRadius: size / 2 };
  if (url) return <Image source={{ uri: url }} style={[frame, styles.photo]} accessibilityIgnoresInvertColors />;
  return (
    <View style={[frame, styles.center, { backgroundColor: a.soft }]}>
      <Text style={{ color: a.ink, fontSize: size * 0.4, fontWeight: '700' }}>{initials(name)}</Text>
    </View>
  );
}

/** A Team's logo, or its initials on its own colour. */
export function TeamLogo({ team, size = 40 }: { team: { name: string; logo_path: string | null; accent_color: string | null }; size?: number }) {
  const a = paletteFor(team.accent_color);
  const url = imageUrl('team-logos', team.logo_path);
  const frame = { width: size, height: size, borderRadius: size * 0.22 };
  if (url) {
    return (
      <View style={[frame, styles.logoFrame]}>
        <Image source={{ uri: url }} style={{ width: size * 0.9, height: size * 0.9 }} resizeMode="contain" accessibilityLabel={`${team.name} logo`} />
      </View>
    );
  }
  return (
    <View style={[frame, styles.center, { backgroundColor: a.accent }]}>
      <Text style={{ color: a.onAccent, fontSize: size * 0.38, fontWeight: '800' }}>{initials(team.name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  photo: { backgroundColor: colors.surfaceMuted },
  logoFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});
