// Positions (spec §7–§10): custom base Positions, Hybrid Positions and the one special Goalie.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { goaliePosition, sortPositions } from '../../domain/index.ts';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { Badge, Button, Card, ErrorText, Field, ListRow, SectionLabel, ToggleRow, useConfirm } from '../../ui/components';
import { colors, font, radius, space } from '../../ui/theme';
import type { SectionProps } from './types';
import { useAccent } from '../../ui/accent';

export function PositionSettings({ membership, detail, reload }: SectionProps) {
  const accent = useAccent();
  const teamId = membership.team.id;
  const positions = sortPositions(detail.positions);
  const goalie = goaliePosition(detail.config);
  const bases = positions.filter((p) => p.kind === 'BASE');
  const hybrids = positions.filter((p) => p.kind === 'HYBRID');
  const [goalieName, setGoalieName] = useState(goalie?.name ?? 'Goalie');
  const [newName, setNewName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const act = useAction();
  const confirm = useConfirm();

  const exec = (fn: () => Promise<unknown>) =>
    act.run(async () => {
      await fn();
      await reload();
    });

  const togglePick = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const preview = bases
    .filter((b) => picked.includes(b.id))
    .map((b) => b.name)
    .join('/');

  const remove = async (id: string, name: string) => {
    if (!(await confirm.ask(`Delete ${name}?`, 'Positions that players, Events or hybrids use cannot be deleted.', 'Delete', true))) return;
    await exec(() => api('deletePosition', { positionId: id }));
  };

  return (
    <>
      <SectionLabel>Goalie</SectionLabel>
      <Card>
        <ToggleRow
          label="Use a Goalie Position"
          hint="Goalies are counted separately and have their own roster need and callup list."
          value={detail.config.goalieEnabled}
          onChange={(enabled) => void exec(() => api('configureGoalie', { teamId, enabled }))}
        />
        {detail.config.goalieEnabled && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Field label="Goalie Position name" value={goalieName} onChangeText={setGoalieName} maxLength={40} />
            </View>
            <Button
              label="Rename"
              variant="secondary"
              disabled={!goalieName.trim() || goalieName.trim() === goalie?.name}
              onPress={() => void exec(() => api('configureGoalie', { teamId, name: goalieName.trim() }))}
            />
          </View>
        )}
      </Card>

      <SectionLabel>Base Positions</SectionLabel>
      <Card style={{ paddingVertical: 0 }}>
        {bases.map((p, i) => (
          <ListRow
            key={p.id}
            first={i === 0}
            title={p.name}
            right={
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${p.name}`} hitSlop={10} onPress={() => void remove(p.id, p.name)}>
                <Ionicons name="trash-outline" size={20} color={colors.negative} />
              </Pressable>
            }
          />
        ))}
      </Card>
      <Card>
        <Field label="New Position" value={newName} onChangeText={setNewName} maxLength={40} placeholder="Center" hint='Names cannot contain "/", which is reserved for hybrids.' />
        <Button
          label="Add Position"
          variant="secondary"
          disabled={!newName.trim()}
          busy={act.busy}
          onPress={() =>
            void exec(async () => {
              await api('createPosition', { teamId, name: newName.trim() });
              setNewName('');
            })
          }
        />
      </Card>

      <SectionLabel>Hybrid Positions</SectionLabel>
      <Card style={{ paddingVertical: hybrids.length ? 0 : undefined }}>
        {hybrids.length ? (
          hybrids.map((p, i) => (
            <ListRow
              key={p.id}
              first={i === 0}
              title={p.name}
              right={
                <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${p.name}`} hitSlop={10} onPress={() => void remove(p.id, p.name)}>
                  <Ionicons name="trash-outline" size={20} color={colors.negative} />
                </Pressable>
              }
            />
          ))
        ) : (
          <Text style={font.small}>No hybrid Positions yet.</Text>
        )}
      </Card>
      <Card>
        <Text style={font.small}>Pick two or more base Positions. A hybrid player can fill any of them.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {bases.map((b) => {
            const on = picked.includes(b.id);
            return (
              <Pressable
                key={b.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => togglePick(b.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: space.sm,
                  paddingHorizontal: space.md,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: on ? accent.accent : colors.border,
                  backgroundColor: on ? accent.soft : colors.surface,
                }}
              >
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? accent.ink : colors.textMuted} />
                <Text style={font.body}>{b.name}</Text>
              </Pressable>
            );
          })}
        </View>
        {picked.length >= 2 && <Badge label={preview} tone="primary" style={{ alignSelf: 'flex-start' }} />}
        <Button
          label="Add Hybrid Position"
          variant="secondary"
          disabled={picked.length < 2}
          busy={act.busy}
          onPress={() =>
            void exec(async () => {
              await api('createHybridPosition', { teamId, componentIds: picked });
              setPicked([]);
            })
          }
        />
      </Card>
      <ErrorText error={act.error} />
      {confirm.element}
    </>
  );
}
