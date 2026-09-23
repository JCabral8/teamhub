import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../lib/auth';
import { usePushRegistration } from '../lib/push';
import { isConfigured } from '../lib/supabase';
import { TeamsProvider } from '../lib/teams';
import { Empty, Loading, Screen } from '../ui/components';
import { colors } from '../ui/theme';

function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const onSignIn = segments[0] === 'sign-in';
  usePushRegistration(session?.user.id ?? null);

  useEffect(() => {
    if (loading) return;
    if (!session && !onSignIn) router.replace({ pathname: '/sign-in', params: pathname !== '/' ? { next: pathname } : {} });
  }, [loading, session, onSignIn, pathname, router]);

  if (loading) return <Loading />;
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerStyle: { backgroundColor: colors.surface },
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ title: 'TeamHub', headerBackVisible: false }} />
      <Stack.Screen name="event/[id]" options={{ title: 'Event' }} />
      <Stack.Screen name="event/new" options={{ title: 'New Event' }} />
      <Stack.Screen name="event/edit" options={{ title: 'Edit Event' }} />
      <Stack.Screen name="team/new" options={{ title: 'Create Team' }} />
      <Stack.Screen name="team/join" options={{ title: 'Join a Team' }} />
      <Stack.Screen name="join/[code]" options={{ title: 'Join a Team' }} />
      <Stack.Screen name="settings/index" options={{ title: 'Team Settings' }} />
      <Stack.Screen name="settings/[teamId]/index" options={{ title: 'Team Settings' }} />
      <Stack.Screen name="settings/[teamId]/[section]" options={{ title: 'Settings' }} />
      <Stack.Screen name="profile" options={{ title: 'My Profile' }} />
      <Stack.Screen name="stats" options={{ title: 'Statistics' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
    </Stack>
  );
}

export default function RootLayout() {
  if (!isConfigured) {
    return (
      <SafeAreaProvider>
        <Screen>
          <Empty
            title="TeamHub is not connected yet"
            body="Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (see .env.example), then restart the app."
          />
        </Screen>
      </SafeAreaProvider>
    );
  }
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <TeamsProvider>
          <AuthGate />
        </TeamsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
