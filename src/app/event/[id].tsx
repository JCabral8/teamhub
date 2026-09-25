import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { toPlayerRosterView } from '../../domain/index.ts';
import { ManagerRoster } from '../../features/event/ManagerRoster';
import { PlayerAttendance } from '../../features/event/PlayerAttendance';
import { SendAttendance } from '../../features/event/SendAttendance';
import { useAuth } from '../../lib/auth';
import { loadEventDetail, loadTeamDetail } from '../../lib/data';
import { useLoader, useRealtime } from '../../lib/hooks';
import { isManagerOf, useTeams } from '../../lib/teams';
import { Badge, Button, Card, Empty, ErrorText, ListRow, Loading, Screen, SectionLabel } from '../../ui/components';
import { EVENT_TYPE_OPTIONS, STANDING_DISPLAY, eventTitle, eventWhen } from '../../ui/format';
import { font, space } from '../../ui/theme';
import { TeamAccent } from '../../ui/TeamAccent';
import { Avatar } from '../../ui/Avatar';

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
        <View style={{ gap: space.xs }}>
          <Text style={font.title}>{eventTitle(event)}</Text>
          <Text style={font.body}>{eventWhen(event.starts_at, team.timezone)}</Text>
          {event.location ? <Text style={font.small}>{event.location}</Text> : null}
          {teams.active.length > 1 ? <Text style={font.small}>{team.name}</Text> : null}
        </View>
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
          <PlayerRoster detail={detail} released={released} />
        )}
      </Screen>
    </TeamAccent>
  );
}

const STANDING_ORDER = { ATTENDING: 0, PENDING_APPROVAL: 1, NO_RESPONSE: 2, NOT_ATTENDING: 3 } as const;

/**
 * The player view: no Positions, no callup marking or ranking (spec §44, §45, §47). Once attendance
 * is out, who's coming is listed first, each group alphabetical. A Game's roster reads as the lineup.
 * Counts say "attending" rather than "Players" because players cannot tell who is a Goalie (spec §33).
 */
function PlayerRoster({ detail, released }: { detail: Awaited<ReturnType<typeof loadEventDetail>>; released: boolean }) {
  const alphabetical = toPlayerRosterView(detail.roster);
  const people = released ? [...alphabetical].sort((a, b) => STANDING_ORDER[a.standing] - STANDING_ORDER[b.standing]) : alphabetical;
  const attending = people.filter((p) => p.standing === 'ATTENDING').length;
  const heading = detail.event.type === 'GAME' ? 'Lineup' : 'Roster';
  return (
    <>
      <SectionLabel>{released ? `${heading} · ${attending} attending` : heading}</SectionLabel>
      <Card style={{ paddingVertical: people.length ? 0 : undefined }}>
        {people.length ? (
          people.map((p, i) => {
            const s = STANDING_DISPLAY[p.standing];
            return (
              <ListRow
                key={p.userId}
                first={i === 0}
                title={p.displayName}
                leading={<Avatar name={p.displayName} path={detail.avatars[p.userId]} />}
                subtitle={p.reason}
                right={released ? <Badge label={s.label} tone={s.tone} /> : undefined}
              />
            );
          })
        ) : (
          <Text style={font.small}>No one is on this roster yet.</Text>
        )}
      </Card>
    </>
  );
}
