import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, takeReturnPath, useAuth } from '../lib/auth';
import { usePushRegistration } from '../lib/push';
import { isConfigured, openedFromPasswordReset, supabase } from '../lib/supabase';
import { TeamsProvider, useTeams } from '../lib/teams';
import { AccentProvider } from '../ui/accent';
import { Empty, Loading, Screen } from '../ui/components';
import { colors } from '../ui/theme';

// A screen opened from a link or a page refresh gets the tabs underneath, so it has a back button.
export const unstable_settings = { anchor: '(tabs)' };

/** The app follows the colour of the Team picked on the Team tab. */
function SelectedTeamAccent({ children }: { children: ReactNode }) {
  const teams = useTeams();
  return <AccentProvider color={teams.selected?.team.accent_color}>{children}</AccentProvider>;
}

function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const onSignIn = segments[0] === 'sign-in';
  usePushRegistration(session?.user.id ?? null);

  // A "reset your password" email link signs the person in; take them to choose a new password.
  const resetShown = useRef(false);
  useEffect(() => {
    const show = () => {
      if (resetShown.current) return;
      resetShown.current = true;
      router.replace('/reset-password');
    };
    if (!loading && session && openedFromPasswordReset) show();
    const { data } = supabase.auth.onAuthStateChange((event) => event === 'PASSWORD_RECOVERY' && show());
    return () => data.subscription.unsubscribe();
  }, [loading, session, router]);

  // After an email link or Google, pick up where the person was headed (a join link, an Event).
  const signedIn = !!session;
  useEffect(() => {
    if (loading || !signedIn || openedFromPasswordReset) return;
    void takeReturnPath().then((path) => path && router.replace(path as '/'));
  }, [loading, signedIn, router]);

  useEffect(() => {
    if (loading) return;
    if (!session && !onSignIn) router.replace({ pathname: '/sign-in', params: pathname !== '/' ? { next: pathname } : {} });
  }, [loading, session, onSignIn, pathname, router]);

  if (loading) return <Loading />;
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text, fontWeight: '700', fontSize: 17 },
        headerTitleAlign: 'center',
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: true,
        contentStyle: { backgroundColor: colors.background },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
      <Stack.Screen name="sign-in" options={{ title: 'TeamHub', headerBackVisible: false }} />
      <Stack.Screen name="event/[id]/index" options={{ title: 'Event Details' }} />
      <Stack.Screen name="event/[id]/roster" options={{ title: 'Event Roster' }} />
      <Stack.Screen name="event/[id]/callups" options={{ title: 'Callups' }} />
      <Stack.Screen name="event/[id]/schedule-attendance" options={{ title: 'Schedule Attendance' }} />
      <Stack.Screen name="event/[id]/roster-settings" options={{ title: 'Event Roster Settings' }} />
      <Stack.Screen name="event/[id]/invite-callups" options={{ title: 'Invite Callups' }} />
      <Stack.Screen name="event/[id]/player/[userId]" options={{ title: 'Player' }} />
      <Stack.Screen name="event/new" options={{ title: 'Create Event' }} />
      <Stack.Screen name="event/edit" options={{ title: 'Edit Event' }} />
      <Stack.Screen name="team/new" options={{ title: 'Create Team' }} />
      <Stack.Screen name="team/join" options={{ title: 'Join a Team' }} />
      <Stack.Screen name="team/events" options={{ title: 'Team Schedule' }} />
      <Stack.Screen name="team/roster" options={{ title: 'Default Roster' }} />
      <Stack.Screen name="team/edit-roster" options={{ title: 'Edit Default Roster' }} />
      <Stack.Screen name="team/people" options={{ title: 'Players' }} />
      <Stack.Screen name="team/info" options={{ title: 'Team Information' }} />
      <Stack.Screen name="join/[code]" options={{ title: 'Join a Team' }} />
      <Stack.Screen name="settings/index" options={{ title: 'Team Settings' }} />
      <Stack.Screen name="settings/[teamId]/index" options={{ title: 'Team Settings' }} />
      <Stack.Screen name="settings/[teamId]/[section]" options={{ title: 'Settings' }} />
      <Stack.Screen name="profile" options={{ title: 'My Profile' }} />
      <Stack.Screen name="account" options={{ title: 'Account Settings' }} />
      <Stack.Screen name="reset-password" options={{ title: 'New Password', headerBackVisible: false }} />
      <Stack.Screen name="stats" options={{ title: 'Team Statistics' }} />
      <Stack.Screen name="my-stats" options={{ title: 'My Stats' }} />
      <Stack.Screen name="history" options={{ title: 'Attendance History' }} />
      <Stack.Screen name="unavailable" options={{ title: 'Mark Unavailable' }} />
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
          <SelectedTeamAccent>
            <AuthGate />
          </SelectedTeamAccent>
        </TeamsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
