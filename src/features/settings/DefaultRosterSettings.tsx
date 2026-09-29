// Default roster (spec §11; wireframes 2B "Edit Default Roster" and 2C "Position Requirements"): who is
// on the default roster, how many players each Position needs, and the callup spots new Events get.
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { sortPositions, type RosterRole } from '../../domain/index.ts';
import { api } from '../../lib/api';
import type { MyMembership, TeamDetail } from '../../lib/data';
import { useAction } from '../../lib/hooks';
import { Avatar } from '../../ui/Avatar';
import { Button, Card, CheckRow, ErrorText, Loading, Notice, SearchField, StepperRow, ToggleRow } from '../../ui/components';
import { font, space } from '../../ui/theme';
import type { SectionProps } from './types';

export function DefaultRosterEditor({ membership, detail, onSaved }: { membership: MyMembership; detail: TeamDetail; onSaved: () => Promise<void> | void }) {
  const team = membership.team;
  const [onRoster, setOnRoster] = useState<Set<string> | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const [includeCallups, setIncludeCallups] = useState(team.include_callups);
  const [callupSpots, setCallupSpots] = useState(team.callup_spots || 2);
  const [query, setQuery] = useState('');
  const { busy, error, run } = useAction();

  const editable = sortPositions(detail.positions).filter((p) => p.kind === 'BASE' || (p.kind === 'GOALIE' && detail.config.goalieEnabled));
  useEffect(() => {
    if (onRoster) return;
    setOnRoster(new Set(detail.members.filter((m) => m.status === 'ACTIVE' && m.roster_role === 'ROSTER').map((m) => m.id)));
    setValues(Object.fromEntries(editable.map((p) => [p.id, detail.requirements.find((r) => r.positionId === p.id)?.quantity ?? 0])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  if (!onRoster) return <Loading />;

  const positionName = new Map(detail.positions.map((p) => [p.id, p.name]));
  const members = detail.members.filter((m) => m.status === 'ACTIVE' && m.display_name.toLowerCase().includes(query.trim().toLowerCase()));
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
      await api('updateTeamSettings', { teamId: team.id, includeCallups, callupSpots: includeCallups ? callupSpots : 0 });
      for (const m of detail.members.filter((x) => x.status === 'ACTIVE')) {
        const want: RosterRole = onRoster.has(m.id) ? 'ROSTER' : m.roster_role === 'ROSTER' ? 'NONE' : m.roster_role;
        if (want !== m.roster_role) await api('setMemberRosterRole', { membershipId: m.id, rosterRole: want });
      }
      await onSaved();
    });

  return (
    <>
      <Card>
        <Text style={font.heading}>Position Requirements</Text>
        <Text style={font.small}>The default number of players each Position needs. New Games and Events start from these.</Text>
        {editable.map((p) => (
          <StepperRow key={p.id} label={p.name} value={values[p.id] ?? 0} onChange={(v) => setValues({ ...values, [p.id]: v })} />
        ))}
        <Text style={font.small}>Hybrid players count toward whichever of their Positions needs them.</Text>
      </Card>

      <Card>
        <Text style={font.heading}>Callup Settings</Text>
        <ToggleRow label="Always include callups" hint="Keep callup spots in the default roster." value={includeCallups} onChange={setIncludeCallups} />
        {includeCallups && <StepperRow label="Number of callup spots" value={callupSpots} min={1} max={20} onChange={setCallupSpots} />}
        <Notice tone="primary">Callup spots are added to each new Event's roster and are filled using your Team's callup settings.</Notice>
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
      <Button label="Save Changes" busy={busy} onPress={() => void save()} />
    </>
  );
}

/** Team Settings → Default Roster Settings. */
export function DefaultRosterSettings({ membership, detail, reload }: SectionProps) {
  const [saved, setSaved] = useState(false);
  return (
    <>
      <DefaultRosterEditor
        membership={membership}
        detail={detail}
        onSaved={async () => {
          await reload();
          setSaved(true);
        }}
      />
      {saved && <Notice tone="positive" title="Saved" />}
    </>
  );
}
