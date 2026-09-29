import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { sortPositions } from '../../domain/index.ts';
import { useSelectedTeam } from '../../features/team/useSelectedTeam';
import { Avatar } from '../../ui/Avatar';
import { Button, Card, Empty, ErrorText, ListRow, Loading, Notice, Screen, TabBar } from '../../ui/components';
import { colors, font, space } from '../../ui/theme';

/**
 * Wireframe 2A "Default Roster Overview". Managers see Position requirements and each player's
 * Position; players see names only (spec §44).
 */
export default function DefaultRoster() {
  const router = useRouter();
  const { team, manager, data, error, loading, reload } = useSelectedTeam();
  const [tab, setTab] = useState<'players' | 'callups'>('players');

  if (loading && !data) return <Loading />;
  if (!team || !data) return <Empty title="No Team selected" body={error ?? undefined} />;

  const active = data.members.filter((m) => m.status === 'ACTIVE');
  const players = active.filter((m) => m.roster_role === 'ROSTER');
  const callups = active.filter((m) => m.roster_role === 'CALLUP');
  const positions = sortPositions(data.positions).filter((p) => p.kind !== 'GOALIE' || data.config.goalieEnabled);
  const positionName = new Map(positions.map((p) => [p.id, p.name]));
  const required = positions.flatMap((p) => data.requirements.filter((r) => r.positionId === p.id && r.quantity > 0));
  const totalRequired = required.reduce((s, r) => s + r.quantity, 0);
  const hybrids = positions.filter((p) => p.kind === 'HYBRID');
  const list = tab === 'players' ? players : callups;

  return (
    <Screen
      onRefresh={reload}
      footer={manager ? <Button label="Edit Default Roster" onPress={() => router.push('/team/edit-roster')} /> : undefined}
    >
      <ErrorText error={error} />
      <Card>
        <Text style={font.heading}>Roster Summary</Text>
        {team.include_callups && team.callup_spots > 0 ? (
          <Text style={font.body}>
            {`Total: ${players.length + team.callup_spots} (${players.length} ${players.length === 1 ? 'Player' : 'Players'} + ${team.callup_spots} ${team.callup_spots === 1 ? 'Callup' : 'Callups'})`}
          </Text>
        ) : (
          <Text style={font.body}>{`Total: ${players.length} ${players.length === 1 ? 'Player' : 'Players'}`}</Text>
        )}
        <Text style={font.small}>{`${callups.length} on the callup list`}</Text>
      </Card>

      {manager && totalRequired > 0 && players.length < totalRequired && (
        <Notice tone="attention" title="Roster below default">
          {`The default roster needs ${totalRequired} players. You currently have ${players.length}.`}
        </Notice>
      )}

      {manager && (
        <Card>
          <Text style={font.heading}>Position Requirements</Text>
          {required.length ? (
            required.map((r) => {
              const have = players.filter((m) => m.position_id === r.positionId).length;
              const ok = have >= r.quantity;
              return (
                <View key={r.positionId} style={styles.req}>
                  <Text style={[font.body, { flex: 1 }]}>{positionName.get(r.positionId)}</Text>
                  <Text style={[font.body, { fontWeight: '600' }]}>
                    {have} / {r.quantity}
                  </Text>
                  <Ionicons name={ok ? 'checkmark' : 'alert-circle'} size={20} color={ok ? colors.positive : colors.attentionDot} />
                </View>
              );
            })
          ) : (
            <Text style={font.small}>No requirements set: everyone who says Yes attends.</Text>
          )}
          {hybrids.map((h) => {
            const have = players.filter((m) => m.position_id === h.id).length;
            return have ? (
              <Text key={h.id} style={font.small}>
                {`${have} ${h.name} ${have === 1 ? 'player fills' : 'players fill'} whichever Position needs them.`}
              </Text>
            ) : null;
          })}
        </Card>
      )}

      <TabBar
        options={[
          { value: 'players', label: `Players (${players.length})` },
          { value: 'callups', label: `Callups (${callups.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />
      <Card flush>
        {list.length ? (
          list.map((m, i) => (
            <ListRow
              key={m.id}
              first={i === 0}
              title={m.display_name}
              subtitle={manager ? (m.position_id ? (positionName.get(m.position_id) ?? 'No Position') : 'No Position') : null}
              leading={<Avatar name={m.display_name} path={m.avatar_path} size={36} />}
              onPress={manager ? () => router.push({ pathname: '/settings/[teamId]/[section]', params: { teamId: team.id, section: 'members' } }) : undefined}
            />
          ))
        ) : (
          <Text style={[font.small, { paddingVertical: space.lg }]}>{tab === 'players' ? 'No players on the default roster yet.' : 'No callups yet.'}</Text>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  req: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
