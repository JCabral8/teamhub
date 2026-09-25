import { Stack, useRouter } from 'expo-router';
import { Button, Empty, Screen } from '../ui/components';

/** Shown for links to screens that don't exist, such as an old or mistyped link. */
export default function NotFound() {
  const router = useRouter();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'TeamHub' }} />
      <Empty title="This page doesn't exist" body="The link may be old or mistyped.">
        <Button label="Go to Home" onPress={() => router.replace('/')} />
      </Empty>
    </Screen>
  );
}
