import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { useAuth } from '../../lib/auth';
import { loadNotifications } from '../../lib/data';
import { useLoader, useRealtime } from '../../lib/hooks';
import { useAccent } from '../../ui/accent';
import { colors, space } from '../../ui/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const icon =
  (name: IconName, active: IconName) =>
  ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => <Ionicons name={focused ? active : name} color={color} size={size} />;

/** The bell in the top right of Home and Schedule, with a dot while something is unread. */
function Bell() {
  const router = useRouter();
  const { userId } = useAuth();
  const { data, reload } = useLoader(async () => (userId ? (await loadNotifications(30)).some((n) => !n.read_at) : false), [userId]);
  useRealtime(`bell-${userId}`, userId ? [{ table: 'notifications', filter: `user_id=eq.${userId}` }] : [], () => void reload());
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={data ? 'Notifications, unread' : 'Notifications'} onPress={() => router.push('/notifications')} hitSlop={10} style={styles.bell}>
      <Ionicons name="notifications" size={22} color={colors.text} />
      {data ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

// Spec §3 and wireframe "Navigation (All Users)": the same four tabs for everyone.
export default function TabsLayout() {
  const a = useAccent();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: a.ink,
        tabBarInactiveTintColor: colors.textFaint,
        // The web has no bottom inset, and the default bar is too short for icon plus label there.
        tabBarStyle: Platform.OS === 'web' ? { height: 60, paddingTop: 4, paddingBottom: 6 } : undefined,
        headerTitleAlign: 'center',
        headerTitleStyle: { color: colors.text, fontWeight: '700', fontSize: 17 },
        headerStyle: { backgroundColor: colors.surface },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline', 'home'), headerRight: () => <Bell /> }} />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarIcon: icon('calendar-outline', 'calendar'), headerRight: () => <Bell /> }} />
      <Tabs.Screen name="team" options={{ title: 'Team', tabBarIcon: icon('people-outline', 'people') }} />
      <Tabs.Screen name="other" options={{ title: 'Other', tabBarIcon: icon('menu-outline', 'menu') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bell: { marginRight: space.lg },
  dot: { position: 'absolute', top: 0, right: 0, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.negative, borderWidth: 1.5, borderColor: colors.surface },
});
