import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { useAccent } from '../../ui/accent';
import { colors } from '../../ui/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />;

// Spec §3: HOME, SCHEDULE, TEAM, OTHER for players and Managers alike. There is no Attendance tab.
export default function TabsLayout() {
  const a = useAccent();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: a.ink,
        tabBarInactiveTintColor: colors.textFaint,
        headerTitleStyle: { color: colors.text },
        headerStyle: { backgroundColor: colors.surface },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarIcon: icon('calendar-outline') }} />
      <Tabs.Screen name="team" options={{ title: 'Team', tabBarIcon: icon('people-outline') }} />
      <Tabs.Screen name="other" options={{ title: 'Other', tabBarIcon: icon('ellipsis-horizontal-circle-outline') }} />
    </Tabs>
  );
}
