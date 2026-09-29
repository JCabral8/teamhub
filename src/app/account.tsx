import { Text } from 'react-native';
import { NewPasswordForm } from '../features/NewPasswordForm';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Button, Card, ListRow, Screen, SectionLabel } from '../ui/components';
import { font } from '../ui/theme';

/** Other → Account Settings: email, password, notifications and signing out. */
export default function Account() {
  const { session } = useAuth();
  return (
    <Screen>
      <Card flush>
        <ListRow first icon="mail-outline" title="Email" subtitle={session?.user.email ?? ''} />
      </Card>
      <SectionLabel>Change Password</SectionLabel>
      <Card>
        <NewPasswordForm buttonLabel="Change Password" />
      </Card>
      <SectionLabel>Notification Preferences</SectionLabel>
      <Card>
        <Text style={font.small}>
          Attendance requests, callups, roster changes and Manager alerts arrive as push notifications on the phone app. Turn them on or off in your phone's
          settings for TeamHub. Everything also appears under Notifications.
        </Text>
      </Card>
      <Button label="Sign Out" icon="log-out-outline" variant="danger" onPress={() => void supabase.auth.signOut()} />
    </Screen>
  );
}
