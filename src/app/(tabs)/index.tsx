import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { localDate, localTime } from '../../domain/index.ts';
import { useAuth } from '../../lib/auth';
import { loadEvents, loadManagerAlerts, loadMyRosterLines, type ManagerAlerts, type MyRosterLine, type TeamEvent } from '../../lib/data';
import { useLoader, useRealtime } from '../../lib/hooks';
import { isManagerOf, useTeams } from '../../lib/teams';
import { Button, ButtonRow, Card, Empty, ErrorText, ListRow, Loading, Notice, Screen, SectionLabel } from '../../ui/components';
import { useAccent } from '../../ui/accent';
import { EventRow } from '../../ui/EventRow';
import { EVENT_TYPE_STYLE } from '../../ui/EventTypeIcon';
import { clock, shortDate } from '../../ui/format';
import { font, space } from '../../ui/theme';

/** Wireframe "Home Screens": what needs doing first, then what's coming up. */
export default function Home() {
  const router = useRouter();
  const { userId } = useAuth();
  const teams = useTeams();
  const accent = useAccent();
  const teamIds = teams.active.map((m) => m.team.id);
  const managedIds = teams.active.filter(isManagerOf).map((m) => m.team.id);

  const { data, error, loading, reload } = useLoader(async () => {
    if (!userId) return { events: [] as TeamEvent[], lines: new Map<string, MyRosterLine>(), alerts: null as ManagerAlerts | null };
    const events = await loadEvents(teamIds, { from: new Date() });
    const released = events.filter((e) => e.release_state === 'RELEASED' && managedIds.includes(e.team_id)).map((e) => e.id);
    const [lines, alerts] = await Promise.all([
      loadMyRosterLines(userId, events.map((e) => e.id)),
      managedIds.length ? loadManagerAlerts(managedIds, released) : Promise.resolve(null),
    ]);
    return { events, lines, alerts };
  }, [teamIds.join(','), managedIds.join(','), userId]);

  useRealtime(`home-${userId}`, [{ table: 'notifications', filter: `user_id=eq.${userId}` }], () => {
    void reload();
    void teams.reload();
  });

  if (teams.loading || (loading && !data)) return <Loading />;

  const waiting = teams.memberships.filter((m) => m.status === 'PENDING');
  const waitingNotices = waiting.map((m) => (
    <Notice key={m.id} tone="attention" title={`Waiting to join ${m.team.name}`} icon="time">
      A Manager needs to approve your request before you can see the Team.
    </Notice>
  ));

  if (!teams.active.length) {
    return (
      <Screen onRefresh={teams.reload}>
        {waitingNotices}
        <Empty title="You're not on a Team yet" body="Join with the link your Manager sent you, or create a Team to manage.">
          <ButtonRow>
            <Button label="Join a Team" onPress={() => router.push('/team/join')} />
            <Button label="Create a Team" variant="secondary" onPress={() => router.push('/team/new')} />
          </ButtonRow>
        </Empty>
      </Screen>
    );
  }

  const teamOf = new Map(teams.active.map((m) => [m.team.id, m.team]));
  const events = data?.events ?? [];
  const open = (id: string) => router.push({ pathname: '/event/[id]', params: { id } });
  const needsAnswer = events.filter((e) => e.release_state === 'RELEASED' && data?.lines.get(e.id)?.response === 'NO_RESPONSE');
  const multiTeam = teams.active.length > 1;

  // Manager items: players who haven't answered, callups waiting, join requests.
  const alerts = data?.alerts;
  const managerItems: { key: string; title: string; lines: string[]; action: string; onPress: () => void }[] = [];
  if (alerts) {
    for (const e of events) {
      const team = teamOf.get(e.team_id)!;
      const callups = alerts.openCallups.get(e.id) ?? 0;
      const players = Math.max(0, (alerts.noResponse.get(e.id) ?? 0) - callups);
      const when = whenLine(e, team.timezone);
      if (players > 0) {
        managerItems.push({ key: `nr-${e.id}`, title: `${players} ${players === 1 ? 'Player hasn’t' : 'Players haven’t'} responded`, lines: [team.name, when], action: 'View Event', onPress: () => open(e.id) });
      }
      if (callups > 0) {
        managerItems.push({ key: `cu-${e.id}`, title: `${callups} ${callups === 1 ? 'Callup' : 'Callups'} Pending`, lines: [team.name, when], action: 'View Callups', onPress: () => router.push({ pathname: '/event/[id]/callups', params: { id: e.id } }) });
      }
    }
    for (const [teamId, count] of alerts.joinRequests) {
      managerItems.push({
        key: `jr-${teamId}`,
        title: `${count} Membership ${count === 1 ? 'Request' : 'Requests'}`,
        lines: [teamOf.get(teamId)?.name ?? ''],
        action: 'Review',
        onPress: () => router.push({ pathname: '/settings/[teamId]/[section]', params: { teamId, section: 'members' } }),
      });
    }
  }

  const upcoming = events.filter((e) => !needsAnswer.includes(e)).slice(0, 6);
  const nothingToDo = !needsAnswer.length && !managerItems.length;

  return (
    <Screen onRefresh={reload}>
      <ErrorText error={error ?? teams.error} />
      {waitingNotices}

      <SectionLabel>Action Required</SectionLabel>
      {nothingToDo && (
        <Card>
          <View style={styles.allDone}>
            <Text style={font.body}>You're all caught up.</Text>
          </View>
        </Card>
      )}
      {needsAnswer.map((e) => {
        const team = teamOf.get(e.team_id)!;
        return (
          <Card key={e.id} style={[styles.action, { borderLeftColor: accent.accent }]}>
            <Text style={font.heading}>Attendance Needed</Text>
            <View>
              <Text style={font.body}>{team.name}</Text>
              <Text style={font.small}>{whenLine(e, team.timezone)}</Text>
              <Text style={font.small}>{typeLine(e)}</Text>
            </View>
            <Button label="Respond" onPress={() => open(e.id)} />
          </Card>
        );
      })}
      {managerItems.map((item) => (
        <Card key={item.key} flush>
          <ListRow first title={item.title} subtitle={item.lines.filter(Boolean).join('\n')} strong onPress={item.onPress} />
        </Card>
      ))}

      <SectionLabel>Upcoming Events</SectionLabel>
      <Card bare>
        {upcoming.length ? (
          upcoming.map((e, i) => {
            const team = teamOf.get(e.team_id)!;
            return (
              <EventRow
                key={e.id}
                first={i === 0}
                event={e}
                timezone={team.timezone}
                teamName={team.name}
                showTeam={multiTeam}
                accentColor={multiTeam ? team.accent_color : undefined}
                myLine={data?.lines.get(e.id)}
                onPress={() => open(e.id)}
              />
            );
          })
        ) : (
          <Text style={[font.small, { padding: space.lg }]}>Nothing scheduled.</Text>
        )}
      </Card>
      {events.length > upcoming.length + needsAnswer.length && (
        <Button label="See Full Schedule" variant="ghost" onPress={() => router.push('/schedule')} />
      )}
    </Screen>
  );
}

function whenLine(e: TeamEvent, timezone: string): string {
  const at = new Date(e.starts_at);
  return `${shortDate(localDate(at, timezone), false)} • ${clock(localTime(at, timezone))}`;
}

function typeLine(e: TeamEvent): string {
  const type = EVENT_TYPE_STYLE[e.type].label;
  if (e.opponent?.trim()) return `vs ${e.opponent.trim()} (${type})`;
  return e.name?.trim() ? `${e.name.trim()} (${type})` : type;
}

const styles = StyleSheet.create({
  action: { gap: space.md, borderLeftWidth: 4 },
  allDone: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
