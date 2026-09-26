import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { EventHeader } from '../../features/event/EventHeader';
import { Lineup } from '../../features/event/Lineup';
import { ManagerRoster } from '../../features/event/ManagerRoster';
import { PlayerAttendance } from '../../features/event/PlayerAttendance';
import { SendAttendance } from '../../features/event/SendAttendance';
import { useAuth } from '../../lib/auth';
import { loadEventDetail, loadTeamDetail } from '../../lib/data';
import { useLoader, useRealtime } from '../../lib/hooks';
import { isManagerOf, useTeams } from '../../lib/teams';
import { Button, Card, Empty, ErrorText, Loading, Screen } from '../../ui/components';
import { EVENT_TYPE_OPTIONS } from '../../ui/format';
import { font } from '../../ui/theme';
import { TeamAccent } from '../../ui/TeamAccent';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userId } = useAuth();
  const teams = useTeams();
  const membershipFor = (teamId: string) => teams.active.find((m) => m.team.id === teamId);

  const { data, error, loading, reload } = useLoader(async () => {
    const detail = await loadEventDetail(id, (teamId) => isManagerOf(membershipFor(teamId)));
    const membership = membershipFor(detail.event.team_id);
    const team = membership && isManagerOf(membership) ? await loadTeamDetail(membership.team, true) : null;
    return { detail, team };
  }, [id, teams.active.length]);

  useRealtime(
    `event-${id}`,
    [
      { table: 'events', filter: `id=eq.${id}` },
      { table: 'event_roster_players', filter: `event_id=eq.${id}` },
      { table: 'callup_invitations', filter: `event_id=eq.${id}` },
    ],
    () => void reload(),
  );

  if (teams.loading || (loading && !data)) return <Loading />;
  if (!data) return <Empty title="Event not found" body={error ?? 'It may have been deleted.'} />;

  const { detail } = data;
  const { event } = detail;
  const membership = membershipFor(event.team_id);
  if (!membership) return <Empty title="Event not available" body="You're not an active member of this Team." />;
  const team = membership.team;
  const manager = isManagerOf(membership);
  const released = event.release_state === 'RELEASED';
  const mine = detail.roster.find((r) => r.userId === userId);
  const typeLabel = EVENT_TYPE_OPTIONS.find((o) => o.value === event.type)?.label ?? 'Event';

  return (
    <TeamAccent color={team.accent_color}>
      <Screen onRefresh={reload}>
        <Stack.Screen
          options={{
            title: typeLabel,
            headerRight: manager
              ? () => <Button label="Edit" variant="ghost" onPress={() => router.push({ pathname: '/event/edit', params: { id: event.id } })} style={{ minHeight: 0 }} />
              : undefined,
          }}
        />
        <ErrorText error={error} />
        <EventHeader event={event} team={team} showTeamName={teams.active.length > 1} />
        {event.notes ? (
          <Card>
            <Text style={font.label}>Notes</Text>
            <Text style={font.body}>{event.notes}</Text>
          </Card>
        ) : null}

        {mine && <PlayerAttendance eventId={event.id} entry={mine} released={released} isManager={manager} onChanged={() => void reload()} />}

        {manager && data.team ? (
          <>
            <SendAttendance event={event} team={team} onChanged={() => void reload()} />
            <ManagerRoster detail={detail} team={data.team} onChanged={() => void reload()} />
          </>
        ) : (
          <Lineup detail={detail} />
        )}
      </Screen>
    </TeamAccent>
  );
}
