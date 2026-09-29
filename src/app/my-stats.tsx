import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PlayerAttendanceStats } from '../domain/index.ts';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLoader } from '../lib/hooks';
import { useTeams } from '../lib/teams';
import { Card, Empty, ErrorText, Loading, Screen, Select } from '../ui/components';
import { colors, font, space } from '../ui/theme';

type Row = PlayerAttendanceStats & { displayName: string };

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');

/** Wireframe 14 "My Stats": the signed-in player's own attendance and callup numbers (spec §51). */
export default function MyStats() {
  const { userId } = useAuth();
  const teams = useTeams();
  const [picked, setPicked] = useState<string | null>(null);
  const teamId = picked ?? teams.selected?.team.id ?? '';
  const { data, error, loading } = useLoader(() => (teamId ? api<Row[]>('getAttendanceStatistics', { teamId }) : Promise.resolve([])), [teamId]);

  if (teams.loading) return <Loading />;
  if (!teams.active.length) return <Empty title="No stats yet" body="Stats appear once you're on a Team." />;

  const mine = data?.find((r) => r.userId === userId);
  const r = mine?.regular ?? { invitations: 0, yes: 0, no: 0, noResponse: 0 };
  const c = mine?.callup ?? { invitations: 0, accepted: 0, declined: 0, noResponse: 0 };

  return (
    <Screen>
      {teams.active.length > 1 && (
        <Select title="Choose a Team" options={teams.active.map((m) => ({ value: m.team.id, label: m.team.name }))} value={teamId} onChange={setPicked} />
      )}
      <ErrorText error={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        <>
          <StatCard
            title="Attendance"
            rows={[
              ['Events invited', String(r.invitations)],
              ['Yes', String(r.yes)],
              ['No', String(r.no)],
              ['No Response', String(r.noResponse)],
            ]}
            rates={[
              ['Attendance Rate', pct(r.yes, r.invitations)],
              ['Response Rate', pct(r.yes + r.no, r.invitations)],
            ]}
          />
          <StatCard
            title="Callup Stats"
            rows={[
              ['Invitations', String(c.invitations)],
              ['Accepted', String(c.accepted)],
              ['Declined', String(c.declined)],
              ['No Response', String(c.noResponse)],
            ]}
            rates={[
              ['Acceptance Rate', pct(c.accepted, c.invitations)],
              ['Response Rate', pct(c.accepted + c.declined, c.invitations)],
            ]}
          />
          <Text style={font.small}>Counts Events where attendance was sent to you.</Text>
        </>
      )}
    </Screen>
  );
}

function StatCard({ title, rows, rates }: { title: string; rows: [string, string][]; rates: [string, string][] }) {
  return (
    <Card>
      <Text style={font.heading}>{title}</Text>
      <View>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.line}>
            <Text style={[font.body, { flex: 1 }]}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </View>
        ))}
      </View>
      <View style={styles.rates}>
        {rates.map(([label, value]) => (
          <View key={label} style={styles.rate}>
            <Text style={styles.rateValue}>{value}</Text>
            <Text style={font.small}>{label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  value: { fontSize: 15, fontWeight: '700', color: colors.text },
  rates: { flexDirection: 'row', gap: space.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  rate: { flex: 1, gap: 2 },
  rateValue: { fontSize: 22, fontWeight: '700', color: colors.text },
});
