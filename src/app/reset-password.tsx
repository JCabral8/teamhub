import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { NewPasswordForm } from '../features/NewPasswordForm';
import { Button, Card, Screen } from '../ui/components';
import { font } from '../ui/theme';

/** Opened from a "reset your password" email: the link has already signed the person in. */
export default function ResetPassword() {
  const router = useRouter();
  const [done, setDone] = useState(false);
  return (
    <Screen>
      <Text style={font.title}>Choose a new password</Text>
      <Card>
        {done ? (
          <>
            <Text style={font.body}>Your new password is set. Use it next time you sign in.</Text>
            <Button label="Continue to TeamHub" onPress={() => router.replace('/')} />
          </>
        ) : (
          <NewPasswordForm buttonLabel="Save Password" onDone={() => setDone(true)} />
        )}
      </Card>
    </Screen>
  );
}
