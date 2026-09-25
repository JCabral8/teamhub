import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { localDate, localTime, standingOf } from '../domain/index.ts';
import type { MyRosterLine, TeamEvent } from '../lib/data';
import { paletteFor, useAccent } from './accent';
import { Badge } from './components';
import { STANDING_DISPLAY, clock, eventTitle } from './format';
import { colors, font, radius, space } from './theme';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * One Event in a list. The player's own answer shows as a plain status; nothing marks a callup
 * (spec §47, invariant 15).
 */
export function EventRow({
  event,
  timezone,
  teamName,
  accentColor,
  myLine,
  onPress,
  first,
}: {
  event: TeamEvent;
  timezone: string;
  teamName?: string;
  /** The Event's Team colour, for lists that mix Teams. Otherwise the surrounding accent. */
  accentColor?: string | null;
  myLine?: MyRosterLine;
  onPress: () => void;
  first?: boolean;
}) {
  const surrounding = useAccent();
  const a = accentColor !== undefined ? paletteFor(accentColor) : surrounding;
  const at = new Date(event.starts_at);
  const date = localDate(at, timezone);
  const [y, m, d] = date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const standing = myLine && event.release_state === 'RELEASED' ? STANDING_DISPLAY[standingOf({ response: myLine.response, pendingSince: myLine.pending_since })] : null;
  const detail = [`${weekday} ${clock(localTime(at, timezone))}`, event.location].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.dateBlock, { backgroundColor: a.soft }]}>
        <Text style={[styles.month, { color: a.ink }]}>{MONTHS[m - 1]}</Text>
        <Text style={[styles.day, { color: a.ink }]}>{d}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[font.body, { fontWeight: '600' }]} numberOfLines={1}>
          {eventTitle(event)}
        </Text>
        <Text style={font.small} numberOfLines={1}>
          {teamName ? `${teamName} · ${detail}` : detail}
        </Text>
        {standing && <Badge label={standing.label} tone={standing.tone} style={{ alignSelf: 'flex-start' }} />}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dateBlock: { width: 48, alignItems: 'center', paddingVertical: space.xs, borderRadius: radius.md },
  month: { fontSize: 11, fontWeight: '700' },
  day: { fontSize: 20, fontWeight: '700' },
});
