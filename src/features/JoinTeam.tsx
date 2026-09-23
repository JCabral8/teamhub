// Joining is by link or code only, and always needs a Manager's approval (spec §6).
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { api } from '../lib/api';
import { useAction } from '../lib/hooks';
import { useTeams } from '../lib/teams';
import { Button, Card, ErrorText, Field, Notice, Screen } from '../ui/components';
import { font } from '../ui/theme';

/** Accepts a full join link or the bare code. */
export function parseJoinCode(input: string): string {
  const s = input.trim();
  const m = /join\/([A-Za-z0-9_-]+)/.exec(s);
  return m ? m[1] : s;
}

export function JoinTeam({ initialCode = '' }: { initialCode?: string }) {
  const router = useRouter();
  const teams = useTeams();
  const [code, setCode] = useState(initialCode);
  const [sent, setSent] = useState(false);
  const { busy, error, setError, run } = useAction();

  const submit = () =>
    run(async () => {
      const joinCode = parseJoinCode(code);
      if (!joinCode) return setError('Paste the join link your Manager sent you.');
      await api('requestToJoin', { joinCode });
      await teams.reload();
      setSent(true);
    });

  if (sent) {
    return (
      <Screen>
        <Notice tone="positive" title="Request sent">
          A Manager needs to approve you before you join. You'll get a notification when they do.
        </Notice>
        <Button label="Done" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={font.small}>
          Paste the join link from your Manager. Your preferred Position from My Profile is shared with the Manager, who confirms your Team Position.
        </Text>
        <Field label="Join link or code" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} placeholder="teamhub://join/…" />
        <ErrorText error={error} />
        <Button label="Request to Join" busy={busy} onPress={() => void submit()} />
      </Card>
      <Button label="Set my preferred Position" variant="ghost" onPress={() => router.push('/profile')} />
    </Screen>
  );
}
