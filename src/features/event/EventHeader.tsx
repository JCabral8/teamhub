// The top of an Event: logo vs logo for a Game with an opponent, then where and when.
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { localDate, localTime } from '../../domain/index.ts';
import type { Team, TeamEvent } from '../../lib/data';
import { OpponentLogo, TeamLogo } from '../../ui/Avatar';
import { Card } from '../../ui/components';
import { clock, eventTitle, longDate } from '../../ui/format';
import { colors, font, space } from '../../ui/theme';

const LOGO = 72;

export function EventHeader({ event, team, showTeamName }: { event: TeamEvent; team: Team; showTeamName: boolean }) {
  const at = new Date(event.starts_at);
  const where = event.location ?? team.default_location ?? team.arena;
  const matchup = event.type === 'GAME' && !!event.opponent?.trim();
  return (
    <Card style={{ gap: space.lg }}>
      {matchup ? (
        <>
          {event.name ? <Text style={[font.label, { textAlign: 'center' }]}>{event.name}</Text> : null}
          <View style={styles.matchup}>
            <View style={styles.side}>
              <TeamLogo team={team} size={LOGO} />
              <Text style={styles.teamName} numberOfLines={2}>
                {team.name}
              </Text>
            </View>
            <Text style={styles.vs}>vs</Text>
            <View style={styles.side}>
              <OpponentLogo name={event.opponent!} size={LOGO} avoid={team.accent_color} />
              <Text style={styles.teamName} numberOfLines={2}>
                {event.opponent!.trim()}
              </Text>
            </View>
          </View>
        </>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <TeamLogo team={team} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={font.title}>{eventTitle(event)}</Text>
            {showTeamName ? <Text style={font.small}>{team.name}</Text> : null}
          </View>
        </View>
      )}
      <View style={{ gap: space.sm }}>
        <Detail icon="time-outline" main={clock(localTime(at, team.timezone))} sub={longDate(localDate(at, team.timezone))} />
        {where ? <Detail icon="location-outline" main={where} /> : null}
      </View>
    </Card>
  );
}

function Detail({ icon, main, sub }: { icon: 'time-outline' | 'location-outline'; main: string; sub?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <Ionicons name={icon} size={22} color={colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={[font.body, { fontWeight: '600' }]}>{main}</Text>
        {sub ? <Text style={font.small}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  matchup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md },
  side: { flex: 1, alignItems: 'center', gap: space.sm },
  teamName: { ...font.heading, textAlign: 'center' },
  vs: { fontSize: 18, fontWeight: '700', color: colors.textFaint },
});
