import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useAuth } from '../lib/auth';
import { loadProfile, saveProfile } from '../lib/data';
import { useAction, useLoader } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import { Button, Card, ErrorText, Field, ListRow, Loading, Notice, Screen, SectionLabel } from '../ui/components';
import { font } from '../ui/theme';

/** OTHER → MY PROFILE (spec §17). The preferred Position is a preference only; Managers set the official one. */
export default function Profile() {
  const { session, userId } = useAuth();
  const { data, loading, error } = useLoader(() => loadProfile(userId!), [userId]);
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [saved, setSaved] = useState(false);
  const { busy, error: saveError, setError, run } = useAction();

  useEffect(() => {
    if (!data) return;
    setName(data.display_name);
    setPosition(data.preferred_position ?? '');
  }, [data]);

  if (loading && !data) return <Loading />;

  const save = () =>
    run(async () => {
      setSaved(false);
      if (!name.trim()) return setError('Enter your name.');
      await saveProfile(userId!, { display_name: name.trim(), preferred_position: position.trim() || null });
      setSaved(true);
    });

  return (
    <Screen>
      <ErrorText error={error} />
      <Card>
        <Field label="Name" value={name} onChangeText={setName} maxLength={60} />
        <Field
          label="Preferred Position"
          value={position}
          onChangeText={setPosition}
          maxLength={40}
          placeholder="Forward"
          hint="Shown to a Manager when you ask to join. Your Team Position is set by the Manager."
        />
        <ErrorText error={saveError} />
        <Button label="Save" busy={busy} onPress={() => void save()} />
        {saved && <Notice tone="positive" title="Saved" />}
      </Card>
      <SectionLabel>Account</SectionLabel>
      <Card style={{ paddingVertical: 0 }}>
        <ListRow first title="Email" subtitle={session?.user.email ?? ''} />
      </Card>
      <SectionLabel>Notifications</SectionLabel>
      <Card>
        <Text style={font.small}>
          Attendance requests, roster changes and Manager alerts arrive as push notifications. Turn them on or off in your phone's settings for TeamHub.
        </Text>
      </Card>
      <Button label="Sign Out" variant="danger" onPress={() => void supabase.auth.signOut()} />
    </Screen>
  );
}
