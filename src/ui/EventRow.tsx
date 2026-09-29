import { Pressable, StyleSheet, Text, View } from 'react-native';
import { localDate, localTime, standingOf } from '../domain/index.ts';
import type { MyRosterLine, TeamEvent } from '../lib/data';
import { paletteFor, useAccent } from './accent';
import { EventTypeIcon, StandingPill } from './EventTypeIcon';
import { clock, dateColumn, matchTitle } from './format';
import { colors, font, space } from './theme';

/**
 * One Event in a schedule list (wireframe 6F "My Schedule"): the date on the left, the type icon,
 * the title, time and place, then the person's own status. Nothing marks a callup (spec §47).
 */
export function EventRow({
  event,
  timezone,
  teamName,
  showTeam,
  accentColor,
  myLine,
  onPress,
  first,
  hideDate,
  highlighted,
}: {
  event: TeamEvent;
  timezone: string;
  /** The Event's Team, used in "Slapsticks vs Bulldogs". */
  teamName: string;
  /** Also print the Team name, for lists that mix Teams. */
  showTeam?: boolean;
  /** The Event's Team colour, for lists that mix Teams. Otherwise the surrounding accent. */
  accentColor?: string | null;
  myLine?: MyRosterLine;
  onPress: () => void;
  first?: boolean;
  /** Leave the date column out, when the list is already one day. */
  hideDate?: boolean;
  highlighted?: boolean;
}) {
  const surrounding = useAccent();
  const a = accentColor !== undefined ? paletteFor(accentColor) : surrounding;
  const at = new Date(event.starts_at);
  const col = dateColumn(localDate(at, timezone));
  const released = event.release_state === 'RELEASED';
  const standing = myLine ? standingOf({ response: myLine.response, pendingSince: myLine.pending_since }) : null;
  const where = [showTeam ? teamName : null, event.location].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.divider, highlighted && { backgroundColor: a.soft }, pressed && { opacity: 0.7 }]}
    >
      {!hideDate && (
        <View style={styles.dateCol}>
          <Text style={[styles.weekday, highlighted && { color: a.ink }]}>{col.weekday}</Text>
          <Text style={[styles.day, highlighted && { color: a.ink }]}>{col.day}</Text>
        </View>
      )}
      <EventTypeIcon type={event.type} size={34} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={2}>
          {matchTitle(event, teamName)}
        </Text>
        <Text style={font.small} numberOfLines={1}>
          {clock(localTime(at, timezone))}
        </Text>
        {where ? (
          <Text style={font.small} numberOfLines={1}>
            {where}
          </Text>
        ) : null}
        {standing && (
          <View style={{ flexDirection: 'row', marginTop: 2 }}>
            <StandingPill standing={standing} released={released} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  dateCol: { width: 48, paddingTop: 2 },
  weekday: { fontSize: 12, color: colors.textMuted },
  day: { fontSize: 14, fontWeight: '600', color: colors.text },
});
