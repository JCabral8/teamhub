import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '../lib/auth';
import { loadEvents, loadMyCallups, loadMyRosterLines, type MyCallup, type MyRosterLine, type TeamEvent } from '../lib/data';
import { useLoader } from '../lib/hooks';
import { useTeams } from '../lib/teams';
import { Card, Empty, ErrorText, Loading, Screen } from '../ui/components';
import { EventRow } from '../ui/EventRow';
import { font, space } from '../ui/theme';

/** Other → Attendance History: past Events you were asked about, with your answer. */
export default function History() {
  const router = useRouter();
  const { userId } = useAuth();
  const teams = useTeams();
  const teamIds = teams.active.map((m) => m.team.id);
  const { data, error, loading, reload } = useLoader(async () => {
    if (!userId) return { events: [] as TeamEvent[], lines: new Map<string, MyRosterLine>(), callups: new Map<string, MyCallup>() };
    const events = (await loadEvents(teamIds, { from: new Date(Date.now() - 365 * 86_400_000), to: new Date() })).reverse();
    const [lines, callups] = await Promise.all([loadMyRosterLines(userId, events.map((e) => e.id)), loadMyCallups()]);
    return { events: events.filter((e) => (lines.has(e.id) || callups.has(e.id)) && e.release_state === 'RELEASED'), lines, callups };
  }, [teamIds.join(','), userId]);

  if (teams.loading || (loading && !data)) return <Loading />;
  if (!teams.active.length) return <Empty title="No history yet" />;
  const teamOf = new Map(teams.active.map((m) => [m.team.id, m.team]));
  const events = data?.events ?? [];
  const multiTeam = teams.active.length > 1;

  return (
    <Screen onRefresh={reload}>
      <ErrorText error={error} />
      <Card bare>
        {events.length ? (
          events.map((e, i) => {
            const team = teamOf.get(e.team_id)!;
            return (
              <EventRow
                key={e.id}
                first={i === 0}
                event={e}
                timezone={team.timezone}
                teamName={team.name}
                showTeam={multiTeam}
                myLine={data?.lines.get(e.id)}
                myCallup={data?.callups.get(e.id)}
                onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
              />
            );
          })
        ) : (
          <Text style={[font.small, { padding: space.lg }]}>No past Events yet.</Text>
        )}
      </Card>
    </Screen>
  );
}
