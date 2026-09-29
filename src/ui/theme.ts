// Design tokens, following the wireframes in design/: a white, airy layout with navy text, one
// bright blue for actions and soft coloured status pills. Screens read colours from here.
export const colors = {
  background: '#F5F7FB',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F4F9',
  border: '#E3E8F0',
  text: '#0F1B3D',
  textMuted: '#5B6478',
  textFaint: '#98A1B3',
  primary: '#1668F2',
  primaryText: '#FFFFFF',
  primarySoft: '#E8F0FE',
  positive: '#1E9E53',
  positiveSoft: '#E3F5EA',
  negative: '#E0383B',
  negativeSoft: '#FDE8E8',
  attention: '#A86A00',
  attentionSoft: '#FFF3D1',
  attentionDot: '#F5B800',
  disabled: '#C9CFDA',
  /** Days a player marked unavailable. */
  unavailable: '#DCE1E9',
  overlay: 'rgba(15, 27, 61, 0.45)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 12, xl: 16, pill: 999 } as const;

export const font = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 16, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textMuted },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.textMuted },
};

export type Tone = 'neutral' | 'positive' | 'negative' | 'attention' | 'primary';

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textMuted, bg: colors.surfaceMuted },
  positive: { fg: colors.positive, bg: colors.positiveSoft },
  negative: { fg: colors.negative, bg: colors.negativeSoft },
  attention: { fg: colors.attention, bg: colors.attentionSoft },
  primary: { fg: colors.primary, bg: colors.primarySoft },
};

/** Card shadow: barely there, like the wireframes. */
export const shadow = {
  shadowColor: '#0F1B3D',
  shadowOpacity: 0.05,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;
