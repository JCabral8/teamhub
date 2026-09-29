import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { localDate, localTime } from '../../domain/index.ts';
import { loadEvents, loadTeamDetail } from '../../lib/data';
import { useLoader, useRealtime } from '../../lib/hooks';
import { isManagerOf, useTeams } from '../../lib/teams';
import { TeamLogo } from '../../ui/Avatar';
import { Button, Card, CountBubble, Empty, ErrorText, ListRow, Loading, Notice, Screen, SectionLabel, Select } from '../../ui/components';
import { EVENT_TYPE_STYLE, EventTypeIcon } from '../../ui/EventTypeIcon';
import { clock, shortDate } from '../../ui/format';
import { font, space } from '../../ui/theme';

/** Wireframes 6 and 7 "Team Tab": pick a Team, see its next Event, then everything about the Team. */
export default function TeamScreen() {
  const router = useRouter();
  const teams = useTeams();
  const membership = teams.selected;
  const team = membership?.team;
  const manager = isManagerOf(membership);

  const { data, error, loading, reload } = useLoader(async () => {
    if (!team) return null;
    const [detail, events] = await Promise.all([loadTeamDetail(team, manager), loadEvents([team.id], { from: new Date(Date.now() - 3 * 3600_000) })]);
    return { detail, events };
  }, [team?.id, manager]);

  useRealtime(`team-${team?.id}`, team ? [{ table: 'events', filter: `team_id=eq.${team.id}` }, { table: 'team_memberships', filter: `team_id=eq.${team.id}` }] : [], () => void reload());

  if (teams.loading) return <Loading />;
  if (!membership || !team) {
    return (
      <Screen onRefresh={teams.reload}>
        {teams.memberships
          .filter((m) => m.status === 'PENDING')
          .map((m) => (
            <Notice key={m.id} tone="attention" icon="time" title={`Waiting to join ${m.team.name}`}>
              A Manager needs to approve your request before you can see the Team.
            </Notice>
          ))}
        <Empty title="No Team yet" body="Join a Team with your Manager's link, or create one." />
        <Button label="Join a Team" onPress={() => router.push('/team/join')} />
        <Button label="Create a Team" variant="secondary" onPress={() => router.push('/team/new')} />
      </Screen>
    );
  }
  if (loading && !data) return <Loading />;

  const next = data?.events[0];
  const members = (data?.detail.members ?? []).filter((m) => m.status === 'ACTIVE');
  const joinRequests = (data?.detail.members ?? []).filter((m) => m.status === 'PENDING').length;
  const count = (role: 'ROSTER' | 'CALLUP') => members.filter((m) => m.roster_role === role).length;
  const managers = members.filter((m) => m.manager_role).length;
  const go = (pathname: '/team/events' | '/team/roster' | '/team/info', params?: Record<string, string>) => router.push({ pathname, params });
  const people = (kind: 'players' | 'callups' | 'managers') => router.push({ pathname: '/team/people', params: { kind } });

  return (
    <Screen onRefresh={reload}>
      {teams.active.length > 1 ? (
        <Select
          title="Choose a Team"
          options={teams.active.map((m) => ({ value: m.team.id, label: m.team.name, icon: <TeamLogo team={m.team} size={28} /> }))}
          value={team.id}
          onChange={teams.select}
        />
      ) : (
        <View style={styles.teamHead}>
          <TeamLogo team={team} size={44} />
          <Text style={[font.title, { flex: 1 }]} numberOfLines={2}>
            {team.name}
          </Text>
        </View>
      )}
      <ErrorText error={error} />

      <SectionLabel>Next Event</SectionLabel>
      <Card>
        {next ? (
          <>
            <View style={styles.next}>
              <EventTypeIcon type={next.type} size={44} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={font.heading}>{EVENT_TYPE_STYLE[next.type].label}</Text>
                {next.opponent?.trim() ? <Text style={font.body}>vs {next.opponent.trim()}</Text> : next.name ? <Text style={font.body}>{next.name}</Text> : null}
                <Text style={font.small}>
                  {shortDate(localDate(new Date(next.starts_at), team.timezone), false)} • {clock(localTime(new Date(next.starts_at), team.timezone))}
                </Text>
                {next.location ? <Text style={font.small}>{next.location}</Text> : null}
              </View>
            </View>
            <Button label="View Event" size="sm" onPress={() => router.push({ pathname: '/event/[id]', params: { id: next.id } })} />
          </>
        ) : (
          <Text style={font.small}>Nothing scheduled.</Text>
        )}
      </Card>

      <Card flush>
        <ListRow first icon="calendar-outline" title="Events" subtitle="Full schedule" onPress={() => go('/team/events')} />
        <ListRow icon="clipboard-outline" title="Default Roster" subtitle={`${count('ROSTER')} players`} onPress={() => go('/team/roster')} />
        <ListRow icon="swap-horizontal-outline" title="Callups" subtitle={`${count('CALLUP')} on the callup list`} onPress={() => people('callups')} />
        <ListRow icon="people-outline" title="Players" subtitle={`${members.length} members`} onPress={() => people('players')} />
        <ListRow icon="shield-checkmark-outline" title="Managers" subtitle={`${managers} ${managers === 1 ? 'manager' : 'managers'}`} onPress={() => people('managers')} />
        {manager && (
          <ListRow
            icon="mail-unread-outline"
            title="Invitations"
            subtitle="Join requests and the invite link"
            right={joinRequests ? <CountBubble count={joinRequests} /> : undefined}
            onPress={() => router.push({ pathname: '/settings/[teamId]/[section]', params: { teamId: team.id, section: 'members' } })}
          />
        )}
        {manager && (
          <ListRow icon="settings-outline" title="Team Settings" onPress={() => router.push({ pathname: '/settings/[teamId]', params: { teamId: team.id } })} />
        )}
        <ListRow icon="information-circle-outline" title="Team Information" onPress={() => go('/team/info')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  teamHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  next: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
});
