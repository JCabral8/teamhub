import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { isManagerOf, useTeams } from '../../lib/teams';
import { Card, ListRow, Screen, SectionLabel } from '../../ui/components';

export default function Other() {
  const router = useRouter();
  const teams = useTeams();
  const managed = teams.active.filter(isManagerOf);

  return (
    <Screen>
      <Card style={{ paddingVertical: 0 }}>
        <ListRow first icon="person-circle-outline" title="My Profile" onPress={() => router.push('/profile')} />
        <ListRow icon="notifications-outline" title="Notifications" onPress={() => router.push('/notifications')} />
        <ListRow icon="stats-chart-outline" title="Statistics" onPress={() => router.push('/stats')} />
      </Card>

      {managed.length > 0 && (
        <>
          <SectionLabel>Manager</SectionLabel>
          <Card style={{ paddingVertical: 0 }}>
            <ListRow first icon="settings-outline" title="Team Settings" onPress={() => router.push('/settings')} />
          </Card>
        </>
      )}

      <SectionLabel>Teams</SectionLabel>
      <Card style={{ paddingVertical: 0 }}>
        <ListRow first icon="enter-outline" title="Join a Team" onPress={() => router.push('/team/join')} />
        <ListRow icon="add-circle-outline" title="Create a Team" onPress={() => router.push('/team/new')} />
      </Card>

      <Card style={{ paddingVertical: 0 }}>
        <ListRow first icon="log-out-outline" title="Sign Out" onPress={() => void supabase.auth.signOut()} />
      </Card>
    </Screen>
  );
}
