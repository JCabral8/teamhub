import { Redirect, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { isManagerOf, useTeams } from '../../lib/teams';
import { Card, Empty, ListRow, Loading, Screen } from '../../ui/components';
import { font } from '../../ui/theme';

/** Settings are per Team, so a Manager of several Teams is asked "Which Team?" first (spec §16). */
export default function WhichTeam() {
  const router = useRouter();
  const teams = useTeams();
  const managed = teams.active.filter(isManagerOf);
  if (teams.loading) return <Loading />;
  if (!managed.length) return <Empty title="No Teams to manage" body="Team Settings are for Managers and Assistant Managers." />;
  if (managed.length === 1) return <Redirect href={{ pathname: '/settings/[teamId]', params: { teamId: managed[0].team.id } }} />;
  return (
    <Screen>
      <Text style={font.title}>Which Team?</Text>
      <Card style={{ paddingVertical: 0 }}>
        {managed.map((m, i) => (
          <ListRow key={m.team.id} first={i === 0} title={m.team.name} onPress={() => router.push({ pathname: '/settings/[teamId]', params: { teamId: m.team.id } })} />
        ))}
      </Card>
    </Screen>
  );
}
