import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { sortPositions, type RosterRole } from '../../domain/index.ts';
import { useSelectedTeam } from '../../features/team/useSelectedTeam';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { Avatar } from '../../ui/Avatar';
import { Button, Card, CheckRow, Empty, ErrorText, Loading, Notice, Screen, SearchField, StepperRow } from '../../ui/components';
import { font, space } from '../../ui/theme';

/**
 * Wireframes 2B "Edit Default Roster" and 2C "Position Requirements": who is on the default roster,
 * and how many players each Position needs.
 */
export default function EditDefaultRoster() {
  const router = useRouter();
  const { team, manager, data, loading, error: loadError, teams } = useSelectedTeam();
  const [onRoster, setOnRoster] = useState<Set<string> | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const { busy, error, run } = useAction();

  const editable = data ? sortPositions(data.positions).filter((p) => p.kind === 'BASE' || (p.kind === 'GOALIE' && data.config.goalieEnabled)) : [];
  useEffect(() => {
    if (!data || onRoster) return;
    setOnRoster(new Set(data.members.filter((m) => m.status === 'ACTIVE' && m.roster_role === 'ROSTER').map((m) => m.id)));
    setValues(Object.fromEntries(editable.map((p) => [p.id, data.requirements.find((r) => r.positionId === p.id)?.quantity ?? 0])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (loading && !data) return <Loading />;
  if (!team || !data) return <Empty title="No Team selected" body={loadError ?? undefined} />;
  if (!manager) return <Empty title="Only Managers can edit the default roster" />;
  if (!onRoster) return <Loading />;

  const positionName = new Map(data.positions.map((p) => [p.id, p.name]));
  const members = data.members.filter((m) => m.status === 'ACTIVE' && m.display_name.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id: string) => {
    const next = new Set(onRoster);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOnRoster(next);
  };

  const save = () =>
    run(async () => {
      await api('setDefaultRoster', {
        teamId: team.id,
        requirements: Object.entries(values)
          .filter(([, q]) => q > 0)
          .map(([positionId, quantity]) => ({ positionId, quantity })),
      });
      for (const m of data.members.filter((x) => x.status === 'ACTIVE')) {
        const want: RosterRole = onRoster.has(m.id) ? 'ROSTER' : m.roster_role === 'ROSTER' ? 'NONE' : m.roster_role;
        if (want !== m.roster_role) await api('setMemberRosterRole', { membershipId: m.id, rosterRole: want });
      }
      await teams.reload();
      router.back();
    });

  return (
    <Screen footer={<Button label="Save Changes" busy={busy} onPress={() => void save()} />}>
      <Card>
        <Text style={font.heading}>Position Requirements</Text>
        <Text style={font.small}>The default number of players each Position needs. New Games and Events start from these.</Text>
        {editable.map((p) => (
          <StepperRow key={p.id} label={p.name} value={values[p.id] ?? 0} onChange={(v) => setValues({ ...values, [p.id]: v })} />
        ))}
      </Card>

      <Text style={[font.heading, { marginBottom: -space.sm }]}>Available Players</Text>
      <SearchField value={query} onChangeText={setQuery} />
      <Card flush>
        {members.length ? (
          members.map((m, i) => (
            <CheckRow
              key={m.id}
              first={i === 0}
              checked={onRoster.has(m.id)}
              onPress={() => toggle(m.id)}
              title={m.display_name}
              subtitle={[m.position_id ? positionName.get(m.position_id) : 'No Position', m.roster_role === 'CALLUP' ? 'Callup' : null].filter(Boolean).join(' · ')}
              leading={<Avatar name={m.display_name} path={m.avatar_path} size={32} />}
            />
          ))
        ) : (
          <Text style={[font.small, { paddingVertical: space.lg }]}>No players match.</Text>
        )}
      </Card>
      <Notice tone="primary">Checked players are on the default roster. Changes apply to new Events; existing Events keep their roster.</Notice>
      <ErrorText error={error} />
    </Screen>
  );
}
