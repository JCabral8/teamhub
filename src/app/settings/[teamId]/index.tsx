import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SETTINGS_SECTIONS } from '../../../features/settings/sections';
import { isManagerOf, useTeams } from '../../../lib/teams';
import { Card, Empty, ListRow, Screen } from '../../../ui/components';

export default function TeamSettings() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();
  const teams = useTeams();
  const membership = teams.active.find((m) => m.team.id === teamId);
  if (!membership || !isManagerOf(membership)) return <Empty title="Team Settings are for Managers" />;
  return (
    <Screen>
      <Stack.Screen options={{ title: membership.team.name }} />
      <Card style={{ paddingVertical: 0 }}>
        {SETTINGS_SECTIONS.map((s, i) => (
          <ListRow
            key={s.key}
            first={i === 0}
            icon={s.icon}
            title={s.title}
            subtitle={s.subtitle}
            onPress={() => router.push({ pathname: '/settings/[teamId]/[section]', params: { teamId, section: s.key } })}
          />
        ))}
      </Card>
    </Screen>
  );
}
