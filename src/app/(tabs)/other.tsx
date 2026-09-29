import { useRouter } from 'expo-router';
import { isManagerOf, useTeams } from '../../lib/teams';
import { Card, ListRow, Screen, SectionLabel } from '../../ui/components';

/** Wireframe "Other Tab": personal items for everyone, Team Management for Managers. */
export default function Other() {
  const router = useRouter();
  const teams = useTeams();
  const managed = teams.active.filter(isManagerOf);

  return (
    <Screen>
      <SectionLabel>Personal</SectionLabel>
      <Card flush>
        <ListRow first icon="person-circle-outline" title="My Profile" onPress={() => router.push('/profile')} />
        <ListRow icon="podium-outline" title="My Stats" onPress={() => router.push('/my-stats')} />
        <ListRow icon="time-outline" title="Attendance History" onPress={() => router.push('/history')} />
        <ListRow icon="notifications-outline" title="Notifications" onPress={() => router.push('/notifications')} />
        <ListRow icon="settings-outline" title="Account Settings" onPress={() => router.push('/account')} />
      </Card>

      {managed.length > 0 && (
        <>
          <SectionLabel>Team Management</SectionLabel>
          <Card flush>
            <ListRow first icon="options-outline" title="Team Settings" subtitle="Select a Team to manage settings" onPress={() => router.push('/settings')} />
            <ListRow icon="bar-chart-outline" title="Team Statistics" onPress={() => router.push('/stats')} />
          </Card>
        </>
      )}

      <SectionLabel>Teams</SectionLabel>
      <Card flush>
        <ListRow first icon="enter-outline" title="Join a Team" onPress={() => router.push('/team/join')} />
        <ListRow icon="add-circle-outline" title="Create a Team" onPress={() => router.push('/team/new')} />
      </Card>
    </Screen>
  );
}
