// Design tokens. One light palette for V1; screens read colors from here rather than hardcoding.
export const colors = {
  background: '#F4F5F7',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF0F3',
  border: '#DCE0E5',
  text: '#16191D',
  textMuted: '#5E6670',
  textFaint: '#8A929C',
  primary: '#1F5FD1',
  primaryText: '#FFFFFF',
  primarySoft: '#E4ECFB',
  positive: '#1E8E4E',
  positiveSoft: '#E2F4E9',
  negative: '#C9302C',
  negativeSoft: '#FBE6E5',
  attention: '#B26A00',
  attentionSoft: '#FDF1DC',
  disabled: '#C3C8CF',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;

export const font = {
  title: { fontSize: 24, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textMuted },
  label: { fontSize: 12, fontWeight: '600' as const, color: colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' as const },
};

export type Tone = 'neutral' | 'positive' | 'negative' | 'attention' | 'primary';

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textMuted, bg: colors.surfaceMuted },
  positive: { fg: colors.positive, bg: colors.positiveSoft },
  negative: { fg: colors.negative, bg: colors.negativeSoft },
  attention: { fg: colors.attention, bg: colors.attentionSoft },
  primary: { fg: colors.primary, bg: colors.primarySoft },
};
