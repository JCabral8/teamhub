import { Pressable, StyleSheet, Text, View } from 'react-native';
import { localDate, standingOf } from '../domain/index.ts';
import type { MyCallup, MyRosterLine, TeamEvent } from '../lib/data';
import { paletteFor, useAccent } from './accent';
import { Badge } from './components';
import { EventTypeIcon, StandingPill } from './EventTypeIcon';
import { dateColumn, matchTitle, timeRange } from './format';
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
  myCallup,
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
  /** The person's own callup invitation for this Event, if any (wireframe 7F). */
  myCallup?: MyCallup;
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
          {timeRange(event, timezone)}
        </Text>
        {where ? (
          <Text style={font.small} numberOfLines={1}>
            {where}
          </Text>
        ) : null}
        {(standing || myCallup) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            {myCallup && !myCallup.closed && standing ? <Badge label="Callup" tone="primary" icon="trophy" /> : null}
            {standing ? <StandingPill standing={standing} released={released} /> : myCallup?.closed ? <Badge label="No Longer Needed" tone="neutral" icon="checkmark-done" /> : null}
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
