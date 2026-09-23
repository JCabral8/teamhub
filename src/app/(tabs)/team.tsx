import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { api } from '../../lib/api';
import { loadEvents, loadTeamDetail, type TeamMember } from '../../lib/data';
import { useAction, useLoader, useRealtime } from '../../lib/hooks';
import { isManagerOf, useTeams } from '../../lib/teams';
import { Badge, Button, Card, Chips, Empty, ErrorText, ListRow, Loading, Screen, SectionLabel, Segmented, useConfirm } from '../../ui/components';
import { EventRow } from '../../ui/EventRow';
import { eventTitle, eventWhen, joinLink } from '../../ui/format';
import { colors, font, space } from '../../ui/theme';

type Tab = 'roster' | 'games' | 'events' | 'info';

export default function TeamScreen() {
  const router = useRouter();
  const teams = useTeams();
  const membership = teams.selected;
  const team = membership?.team;
  const manager = isManagerOf(membership);
  const [tab, setTab] = useState<Tab>('roster');
  const leave = useAction();
  const confirm = useConfirm();

  const { data, error, loading, reload } = useLoader(async () => {
    if (!team) return null;
    const [detail, events] = await Promise.all([loadTeamDetail(team, manager), loadEvents([team.id], { from: new Date(Date.now() - 3 * 3600_000) })]);
    return { detail, events };
  }, [team?.id, manager]);

  useRealtime(`team-${team?.id}`, team ? [{ table: 'events', filter: `team_id=eq.${team.id}` }, { table: 'team_memberships', filter: `team_id=eq.${team.id}` }] : [], () => void reload());

  if (teams.loading) return <Loading />;
  if (!membership || !team) {
    return (
      <Screen>
        <Empty title="No Team yet" body="Join a Team with your Manager's link, or create one." />
        <Button label="Join a Team" onPress={() => router.push('/team/join')} />
        <Button label="Create a Team" variant="secondary" onPress={() => router.push('/team/new')} />
      </Screen>
    );
  }
  if (loading && !data) return <Loading />;

  const events = data?.events ?? [];
  const next = events[0];
  const members = (data?.detail.members ?? []).filter((m) => m.status === 'ACTIVE');
  const pendingCount = (data?.detail.members ?? []).filter((m) => m.status === 'PENDING').length;
  const openEvent = (id: string) => router.push({ pathname: '/event/[id]', params: { id } });

  const onLeave = async () => {
    const ok = await confirm.ask(`Leave ${team.name}?`, 'You will stop receiving attendance requests for this Team.', 'Leave Team', true);
    if (!ok) return;
    await leave.run(async () => {
      await api('leaveTeam', { teamId: team.id });
      await teams.reload();
    });
  };

  return (
    <Screen onRefresh={reload}>
      {teams.active.length > 1 && (
        <Chips options={teams.active.map((m) => ({ value: m.team.id, label: m.team.name }))} value={team.id} onChange={teams.select} />
      )}
      <ErrorText error={error} />

      <SectionLabel>Next Team Event</SectionLabel>
      <Card>
        {next ? (
          <View style={{ gap: space.xs }}>
            <Text style={font.heading}>{eventTitle(next)}</Text>
            <Text style={font.small}>{eventWhen(next.starts_at, team.timezone)}</Text>
            {next.location ? <Text style={font.small}>{next.location}</Text> : null}
            <Button label="Open" variant="secondary" onPress={() => openEvent(next.id)} style={{ marginTop: space.sm }} />
          </View>
        ) : (
          <Text style={font.small}>Nothing scheduled.</Text>
        )}
      </Card>

      <Segmented
        options={[
          { value: 'roster', label: 'Roster' },
          { value: 'games', label: 'Games' },
          { value: 'events', label: 'Events' },
          { value: 'info', label: 'Info' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'roster' && (
        <>
          {manager && pendingCount > 0 && (
            <Button
              label={`${pendingCount} join ${pendingCount === 1 ? 'request' : 'requests'} to review`}
              icon="person-add-outline"
              variant="secondary"
              onPress={() => router.push({ pathname: '/settings/[teamId]/[section]', params: { teamId: team.id, section: 'members' } })}
            />
          )}
          {manager ? <ManagerRoster members={members} detail={data?.detail} /> : <PlayerRoster members={members} />}
        </>
      )}

      {(tab === 'games' || tab === 'events') && (
        <>
          {manager && (
            <Button label="New Event" icon="add" variant="secondary" onPress={() => router.push({ pathname: '/event/new', params: { teamId: team.id } })} />
          )}
          <Card style={{ paddingVertical: 0 }}>
            {(() => {
              const list = events.filter((e) => (tab === 'games' ? e.type === 'GAME' : e.type !== 'GAME'));
              return list.length ? (
                list.map((e, i) => <EventRow key={e.id} first={i === 0} event={e} timezone={team.timezone} onPress={() => openEvent(e.id)} />)
              ) : (
                <Text style={[font.small, { paddingVertical: space.lg }]}>{tab === 'games' ? 'No upcoming Games.' : 'No upcoming Events.'}</Text>
              );
            })()}
          </Card>
        </>
      )}

      {tab === 'info' && (
        <>
          <Card style={{ paddingVertical: 0 }}>
            <ListRow first title="Team" subtitle={team.name} />
            <ListRow title="Arena" subtitle={team.arena ?? 'Not set'} />
            <ListRow title="Default location" subtitle={team.default_location ?? team.arena ?? 'Not set'} />
            <ListRow title="Time zone" subtitle={team.timezone} />
            <ListRow
              title="Managers"
              subtitle={
                members
                  .filter((m) => m.manager_role)
                  .map((m) => `${m.display_name}${m.manager_role === 'ASSISTANT_MANAGER' ? ' (Assistant)' : ''}`)
                  .join(', ') || '—'
              }
            />
          </Card>
          {manager && (
            <Card>
              <Text style={font.heading}>Invite players</Text>
              <Text style={font.small}>Share this join link. Every request needs a Manager's approval.</Text>
              <Text selectable style={[font.body, { color: colors.primary }]}>
                {joinLink(team.join_code)}
              </Text>
              <Button
                label="Share Join Link"
                icon="share-outline"
                onPress={() => void Share.share({ message: `Join ${team.name} on TeamHub: ${joinLink(team.join_code)}` }).catch(() => undefined)}
              />
            </Card>
          )}
          {manager && (
            <Button label="Team Settings" icon="settings-outline" variant="secondary" onPress={() => router.push({ pathname: '/settings/[teamId]', params: { teamId: team.id } })} />
          )}
          <Button label="Leave Team" variant="danger" busy={leave.busy} onPress={() => void onLeave()} />
          <ErrorText error={leave.error} />
        </>
      )}
      {confirm.element}
    </Screen>
  );
}

/** Players see names only: the roster and callups, alphabetical, with no Positions or ranking (spec §44, §45). */
function PlayerRoster({ members }: { members: TeamMember[] }) {
  const roster = members.filter((m) => m.roster_role === 'ROSTER');
  const callups = members.filter((m) => m.roster_role === 'CALLUP');
  return (
    <>
      <Card style={{ paddingVertical: 0 }}>
        {roster.length ? roster.map((m, i) => <ListRow key={m.id} first={i === 0} title={m.display_name} />) : <Text style={[font.small, { paddingVertical: space.lg }]}>No players yet.</Text>}
      </Card>
      {callups.length > 0 && (
        <>
          <SectionLabel>Callups</SectionLabel>
          <Card style={{ paddingVertical: 0 }}>
            {callups.map((m, i) => (
              <ListRow key={m.id} first={i === 0} title={m.display_name} />
            ))}
          </Card>
        </>
      )}
    </>
  );
}

/** Managers see official Positions (spec §44). Players on the default roster first, then callups. */
function ManagerRoster({ members, detail }: { members: TeamMember[]; detail: Awaited<ReturnType<typeof loadTeamDetail>> | undefined }) {
  if (!detail) return null;
  const positions = detail.positions.filter((p) => p.kind !== 'GOALIE' || detail.config.goalieEnabled);
  const byPosition = (list: TeamMember[]) => {
    const groups = positions.map((p) => ({ key: p.id, name: p.name, people: list.filter((m) => m.position_id === p.id) }));
    groups.push({ key: 'none', name: 'No Position', people: list.filter((m) => !m.position_id || !positions.some((p) => p.id === m.position_id)) });
    return groups.filter((g) => g.people.length);
  };
  const sections: { title: string; list: TeamMember[] }[] = [
    { title: 'Roster', list: members.filter((m) => m.roster_role === 'ROSTER') },
    { title: 'Callups', list: members.filter((m) => m.roster_role === 'CALLUP') },
    { title: 'Not playing', list: members.filter((m) => m.roster_role === 'NONE') },
  ];
  return (
    <>
      {sections
        .filter((s) => s.list.length)
        .map((s) => (
          <View key={s.title} style={{ gap: space.md }}>
            <SectionLabel>{`${s.title} (${s.list.length})`}</SectionLabel>
            {byPosition(s.list).map((g) => (
              <Card key={g.key} style={{ paddingVertical: space.sm, gap: 0 }}>
                <Text style={[font.body, { fontWeight: '600', paddingTop: space.xs }]}>{g.name}</Text>
                {g.people.map((m) => (
                  <ListRow key={m.id} title={m.display_name} right={m.manager_role ? <Badge label={m.manager_role === 'MANAGER' ? 'Manager' : 'Assistant'} tone="primary" /> : undefined} />
                ))}
              </Card>
            ))}
          </View>
        ))}
      {!members.length && <Text style={font.small}>No members yet.</Text>}
    </>
  );
}
