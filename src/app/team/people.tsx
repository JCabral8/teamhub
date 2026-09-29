import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useSelectedTeam } from '../../features/team/useSelectedTeam';
import { Avatar } from '../../ui/Avatar';
import { Badge, Button, Card, Empty, ErrorText, ListRow, Loading, Notice, Screen, SearchField } from '../../ui/components';
import { font, space } from '../../ui/theme';

type Kind = 'players' | 'callups' | 'managers';
const TITLES: Record<Kind, string> = { players: 'Players', callups: 'Callups', managers: 'Managers' };

/**
 * The Team's players, callups or Managers (Team tab). Players see names only; Managers also see
 * Positions and can open a member to change them (spec §44).
 */
export default function People() {
  const router = useRouter();
  const { kind: raw } = useLocalSearchParams<{ kind?: string }>();
  const kind: Kind = raw === 'callups' || raw === 'managers' ? raw : 'players';
  const { team, manager, data, error, loading, reload } = useSelectedTeam();
  const [query, setQuery] = useState('');

  if (loading && !data) return <Loading />;
  if (!team || !data) return <Empty title="No Team selected" body={error ?? undefined} />;

  const positionName = new Map(data.positions.map((p) => [p.id, p.name]));
  const active = data.members.filter((m) => m.status === 'ACTIVE');
  const list = active
    .filter((m) => (kind === 'callups' ? m.roster_role === 'CALLUP' : kind === 'managers' ? !!m.manager_role : true))
    .filter((m) => m.display_name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (kind === 'managers' ? (a.manager_role === 'MANAGER' ? -1 : b.manager_role === 'MANAGER' ? 1 : 0) : 0) || a.display_name.localeCompare(b.display_name));
  const openMembers = () => router.push({ pathname: '/settings/[teamId]/[section]', params: { teamId: team.id, section: 'members' } });

  const subtitle = (m: (typeof list)[number]) => {
    if (kind === 'managers') return m.manager_role === 'MANAGER' ? 'Team Manager' : 'Assistant Manager';
    if (!manager) return m.roster_role === 'CALLUP' && kind === 'players' ? 'Callup' : null;
    return [m.position_id ? positionName.get(m.position_id) : 'No Position', kind === 'players' && m.roster_role === 'CALLUP' ? 'Callup' : null, kind === 'players' && m.roster_role === 'NONE' ? 'Not playing' : null]
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <Screen onRefresh={reload}>
      <Stack.Screen options={{ title: TITLES[kind] }} />
      <ErrorText error={error} />
      {list.length > 8 || query ? <SearchField value={query} onChangeText={setQuery} placeholder={`Search ${TITLES[kind].toLowerCase()}...`} /> : null}
      <Card flush>
        {list.length ? (
          list.map((m, i) => (
            <ListRow
              key={m.id}
              first={i === 0}
              title={m.display_name}
              subtitle={subtitle(m)}
              leading={<Avatar name={m.display_name} path={m.avatar_path} size={36} />}
              right={kind !== 'managers' && m.manager_role ? <Badge label={m.manager_role === 'MANAGER' ? 'Manager' : 'Assistant'} tone="primary" /> : undefined}
              onPress={manager ? openMembers : undefined}
            />
          ))
        ) : (
          <Text style={[font.small, { paddingVertical: space.lg }]}>{kind === 'callups' ? 'No callups on this Team yet.' : 'No one here yet.'}</Text>
        )}
      </Card>
      {kind === 'callups' && manager && (
        <>
          <Notice tone="primary">
            {team.callup_selection_method === 'RANDOMIZED_ROTATION'
              ? 'Callups are picked at random, favouring those who have played the least, so turns even out.'
              : 'Callups are asked in the order you set in Callup Settings.'}
          </Notice>
          <Button
            label="Callup Settings"
            icon="settings-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/settings/[teamId]/[section]', params: { teamId: team.id, section: 'callups' } })}
          />
        </>
      )}
      {kind === 'players' && manager && <Button label="Manage Members" icon="person-add-outline" variant="secondary" onPress={openMembers} />}
    </Screen>
  );
}
