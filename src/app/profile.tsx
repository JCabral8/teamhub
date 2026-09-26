import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { CalendarSubscribe } from '../features/CalendarSubscribe';
import { NewPasswordForm } from '../features/NewPasswordForm';
import { useAuth } from '../lib/auth';
import { loadProfile, saveProfile } from '../lib/data';
import { useAction, useLoader } from '../lib/hooks';
import { pickImage, prepareImage, removeImage, uploadImage } from '../lib/images';
import { supabase } from '../lib/supabase';
import { Avatar } from '../ui/Avatar';
import { Button, ButtonRow, Card, ErrorText, Field, ListRow, Loading, Notice, Screen, SectionLabel } from '../ui/components';
import { font, space } from '../ui/theme';

/** OTHER → MY PROFILE (spec §17). The preferred Position is a preference only; Managers set the official one. */
export default function Profile() {
  const { session, userId } = useAuth();
  const { data, loading, error, reload } = useLoader(() => loadProfile(userId!), [userId]);
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [saved, setSaved] = useState(false);
  const { busy, error: saveError, setError, run } = useAction();
  const photo = useAction();

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

  const avatarPath = data?.avatar_path ?? null;
  const changePhoto = () =>
    photo.run(async () => {
      const asset = await pickImage({ square: true });
      if (!asset) return;
      const path = await uploadImage('avatars', userId!, await prepareImage(asset, { maxSize: 400, square: true }));
      await saveProfile(userId!, { avatar_path: path });
      removeImage('avatars', avatarPath);
      await reload();
    });
  const removePhoto = () =>
    photo.run(async () => {
      await saveProfile(userId!, { avatar_path: null });
      removeImage('avatars', avatarPath);
      await reload();
    });

  return (
    <Screen>
      <ErrorText error={error} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <Avatar name={data?.display_name ?? name} path={avatarPath} size={80} />
          <Text style={[font.small, { flex: 1 }]}>Your profile picture shows next to your name on Team and Event rosters.</Text>
        </View>
        <ButtonRow>
          <Button label={avatarPath ? 'Change Photo' : 'Add Photo'} icon="camera-outline" variant="secondary" busy={photo.busy} onPress={() => void changePhoto()} style={{ flex: 1 }} />
          {avatarPath && <Button label="Remove" variant="ghost" disabled={photo.busy} onPress={() => void removePhoto()} style={{ flex: 1 }} />}
        </ButtonRow>
        <ErrorText error={photo.error} />
      </Card>
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
      <SectionLabel>Calendar</SectionLabel>
      <CalendarSubscribe />
      <SectionLabel>Account</SectionLabel>
      <Card style={{ paddingVertical: 0 }}>
        <ListRow first title="Email" subtitle={session?.user.email ?? ''} />
      </Card>
      <SectionLabel>Change password</SectionLabel>
      <Card>
        <NewPasswordForm buttonLabel="Change Password" />
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
