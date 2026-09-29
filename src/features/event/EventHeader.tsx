// The top of every Event screen (wireframes 1A–8A): the title, the type, then when and where.
import { StyleSheet, Text, View } from 'react-native';
import { localDate, localTime } from '../../domain/index.ts';
import type { Team, TeamEvent } from '../../lib/data';
import { TeamLogo } from '../../ui/Avatar';
import { Badge, DetailLine } from '../../ui/components';
import { EVENT_TYPE_STYLE, EventTypeIcon } from '../../ui/EventTypeIcon';
import { clock, matchTitle, shortDate } from '../../ui/format';
import { colors, font, space } from '../../ui/theme';

export function EventHeader({ event, team, showTeamName, compact }: { event: TeamEvent; team: Team; showTeamName?: boolean; compact?: boolean }) {
  const at = new Date(event.starts_at);
  const where = event.location ?? team.default_location ?? team.arena;
  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1, gap: space.xs }}>
          <Text style={styles.title}>{matchTitle(event, team.name)}</Text>
          <View style={styles.typeRow}>
            <EventTypeIcon type={event.type} size={26} />
            <Text style={font.body}>{EVENT_TYPE_STYLE[event.type].label}</Text>
            {showTeamName ? <Badge label={team.name} tone="primary" /> : null}
          </View>
        </View>
        {!compact && <TeamLogo team={team} size={44} />}
      </View>
      <View style={{ gap: space.xs }}>
        <DetailLine icon="calendar-outline">{shortDate(localDate(at, team.timezone))}</DetailLine>
        <DetailLine icon="time-outline">{clock(localTime(at, team.timezone))}</DetailLine>
        {where ? <DetailLine icon="location-outline">{where}</DetailLine> : null}
      </View>
    </View>
  );
}

/** Notes as the "Additional Information" bullet list. */
export function AdditionalInfo({ notes }: { notes: string | null }) {
  const lines = (notes ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean);
  if (!lines.length) return null;
  return (
    <View style={{ gap: space.xs }}>
      <Text style={font.heading}>Additional Information</Text>
      {lines.map((l, i) => (
        <View key={i} style={styles.bullet}>
          <Text style={font.body}>•</Text>
          <Text style={[font.body, { flex: 1 }]}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  titleRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bullet: { flexDirection: 'row', gap: space.sm, paddingLeft: space.xs },
});
