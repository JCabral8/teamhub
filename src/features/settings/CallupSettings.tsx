// Callups (spec §38–§42). The order shown here is manager-only; players never see ranking.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SKATER_SLOT, buildCallupPools, type CallupMode, type CallupSelectionMethod } from '../../domain/index.ts';
import { api } from '../../lib/api';
import { loadCallupPoolOrder } from '../../lib/data';
import { useAction, useLoader } from '../../lib/hooks';
import { Button, Card, Chips, ErrorText, ListRow, Notice, SectionLabel, Segmented } from '../../ui/components';
import { colors, font, space } from '../../ui/theme';
import type { SectionProps } from './types';

export function CallupSettings({ membership, detail, reload }: SectionProps) {
  const team = membership.team;
  const [mode, setMode] = useState<CallupMode>(team.callup_mode);
  const [method, setMethod] = useState<CallupSelectionMethod>(team.callup_selection_method);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const dirty = mode !== team.callup_mode || method !== team.callup_selection_method;

  const save = () =>
    run(async () => {
      setSaved(false);
      await api('updateTeamSettings', { teamId: team.id, callupMode: mode, callupSelectionMethod: method });
      await reload();
      setSaved(true);
    });

  return (
    <>
      <Card>
        <Text style={font.heading}>Callup system</Text>
        <Segmented
          options={[
            { value: 'BASIC', label: 'Basic' },
            { value: 'ADVANCED', label: 'Advanced' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Text style={font.small}>
          {mode === 'BASIC'
            ? 'One callup list. Positions are ignored, except the Goalie, who has a separate list.'
            : 'A callup list per Position. Hybrid players appear in each of their Positions, and if a list runs out the search continues in the other lists.'}
        </Text>
      </Card>
      <Card>
        <Text style={font.heading}>Selection method</Text>
        <Chips
          options={[
            { value: 'RANDOMIZED_ROTATION', label: 'Randomized Rotation' },
            { value: 'PREDETERMINED_SEQUENCE', label: 'Predetermined Sequence' },
          ]}
          value={method}
          onChange={setMethod}
        />
        <Text style={font.small}>
          {method === 'RANDOMIZED_ROTATION'
            ? 'Picks at random among the callups who have played the fewest times, so turns even out.'
            : 'Asks callups in the order you set below.'}
        </Text>
      </Card>
      <ErrorText error={error} />
      <Button label="Save" disabled={!dirty} busy={busy} onPress={() => void save()} />
      {saved && !dirty && <Notice tone="positive" title="Saved" />}
      {team.callup_selection_method === 'PREDETERMINED_SEQUENCE' && !dirty && <PoolOrder membership={membership} detail={detail} reload={reload} />}
    </>
  );
}

function PoolOrder({ membership, detail }: SectionProps) {
  const team = membership.team;
  const { data: saved, reload: reloadOrder } = useLoader(() => loadCallupPoolOrder(team.id), [team.id]);
  const callups = detail.members.filter((m) => m.status === 'ACTIVE' && m.roster_role === 'CALLUP');
  const names = new Map(callups.map((m) => [m.user_id, m.display_name]));
  const [pools, setPools] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (!saved) return;
    setPools(
      buildCallupPools(
        callups.map((m) => ({ userId: m.user_id, displayName: m.display_name, positionId: m.position_id, acceptedCount: 0 })),
        saved,
        detail.config,
        team.callup_mode,
      ),
    );
    setDirty(new Set());
    // Rebuild only when the saved order or membership changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, detail, team.callup_mode]);

  const poolName = (key: string) =>
    key === SKATER_SLOT ? (team.callup_mode === 'BASIC' ? 'Callups' : 'No Position set') : (detail.positions.find((p) => p.id === key)?.name ?? 'Position');

  const move = (key: string, index: number, delta: number) => {
    const list = [...pools[key]];
    const [item] = list.splice(index, 1);
    list.splice(index + delta, 0, item);
    setPools({ ...pools, [key]: list });
    setDirty(new Set(dirty).add(key));
  };

  const save = () =>
    run(async () => {
      for (const key of dirty) await api('setCallupPoolOrder', { teamId: team.id, poolKey: key, userIds: pools[key] });
      await reloadOrder();
    });

  const keys = Object.keys(pools);
  return (
    <>
      <SectionLabel>Callup order</SectionLabel>
      {!keys.length && <Text style={font.small}>No callups on this Team yet. Set a member's role to Callup under Members.</Text>}
      {keys.map((key) => (
        <Card key={key} style={{ paddingVertical: space.sm, gap: 0 }}>
          <Text style={[font.body, { fontWeight: '600', paddingTop: space.xs }]}>{poolName(key)}</Text>
          {pools[key].map((userId, i) => (
            <ListRow
              key={userId}
              title={`${i + 1}. ${names.get(userId) ?? 'Player'}`}
              right={
                <View style={{ flexDirection: 'row', gap: space.md }}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Move up" disabled={i === 0} onPress={() => move(key, i, -1)} hitSlop={8}>
                    <Ionicons name="arrow-up" size={20} color={i === 0 ? colors.disabled : colors.primary} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Move down"
                    disabled={i === pools[key].length - 1}
                    onPress={() => move(key, i, 1)}
                    hitSlop={8}
                  >
                    <Ionicons name="arrow-down" size={20} color={i === pools[key].length - 1 ? colors.disabled : colors.primary} />
                  </Pressable>
                </View>
              }
            />
          ))}
        </Card>
      ))}
      {keys.length > 0 && <Button label="Save Order" disabled={!dirty.size} busy={busy} onPress={() => void save()} />}
      <ErrorText error={error} />
    </>
  );
}
