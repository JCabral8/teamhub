import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PlayerAttendanceStats } from '../domain/index.ts';
import { api } from '../lib/api';
import { useLoader } from '../lib/hooks';
import { useTeams } from '../lib/teams';
import { Card, Chips, Empty, ErrorText, Loading, Screen, SectionLabel, Segmented } from '../ui/components';
import { colors, font, space } from '../ui/theme';

type Row = PlayerAttendanceStats & { displayName: string };

/** Attendance statistics (spec §51): regular roster and callups tracked separately; current members only (§52). */
export default function Stats() {
  const teams = useTeams();
  const [picked, setPicked] = useState<string | null>(null);
  const teamId = picked ?? teams.selected?.team.id ?? '';
  const [kind, setKind] = useState<'regular' | 'callup'>('regular');
  const { data, error, loading, reload } = useLoader(() => (teamId ? api<Row[]>('getAttendanceStatistics', { teamId }) : Promise.resolve([])), [teamId]);

  if (teams.loading) return <Loading />;
  if (!teams.active.length) return <Empty title="No statistics yet" body="Statistics appear once you're on a Team." />;
  const rows = (data ?? []).filter((r) => (kind === 'regular' ? r.regular.invitations > 0 : r.callup.invitations > 0));
  const cells = (r: Row): [string, number][] =>
    kind === 'regular'
      ? [
          ['Invited', r.regular.invitations],
          ['Yes', r.regular.yes],
          ['No', r.regular.no],
          ['No Response', r.regular.noResponse],
        ]
      : [
          ['Invited', r.callup.invitations],
          ['Accepted', r.callup.accepted],
          ['Declined', r.callup.declined],
          ['No Response', r.callup.noResponse],
        ];

  return (
    <Screen onRefresh={reload}>
      {teams.active.length > 1 && <Chips options={teams.active.map((m) => ({ value: m.team.id, label: m.team.name }))} value={teamId} onChange={setPicked} />}
      <Segmented
        options={[
          { value: 'regular', label: 'Roster Attendance' },
          { value: 'callup', label: 'Callups' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <ErrorText error={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        <>
          <SectionLabel>{kind === 'regular' ? 'Events sent to the roster' : 'Callup invitations'}</SectionLabel>
          <Card style={{ paddingVertical: rows.length ? 0 : undefined }}>
            {rows.length ? (
              rows.map((r, i) => (
                <View key={r.userId} style={[styles.row, i > 0 && styles.divider]}>
                  <Text style={[font.body, { fontWeight: '600' }]}>{r.displayName}</Text>
                  <View style={styles.cells}>
                    {cells(r).map(([label, value]) => (
                      <View key={label} style={styles.cell}>
                        <Text style={styles.value}>{value}</Text>
                        <Text style={font.small}>{label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            ) : (
              <Text style={font.small}>Nothing recorded yet.</Text>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.md, gap: space.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  cells: { flexDirection: 'row' },
  cell: { flex: 1 },
  value: { fontSize: 18, fontWeight: '700', color: colors.text },
});
