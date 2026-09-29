import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarSubscribe } from '../features/CalendarSubscribe';
import { useAuth } from '../lib/auth';
import { loadProfile, saveProfile } from '../lib/data';
import { useAction, useLoader } from '../lib/hooks';
import { pickImage, prepareImage, removeImage, uploadImage } from '../lib/images';
import { useAccent } from '../ui/accent';
import { Avatar } from '../ui/Avatar';
import { Button, ButtonRow, Card, ErrorText, Field, ListRow, Loading, Screen, SectionLabel } from '../ui/components';
import { font, space } from '../ui/theme';

/** Wireframe 13 "My Profile" (spec §17). The preferred Position is a preference only; Managers set the official one. */
export default function Profile() {
  const router = useRouter();
  const { session, userId } = useAuth();
  const accent = useAccent();
  const { data, loading, error, reload } = useLoader(() => loadProfile(userId!), [userId]);
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [editing, setEditing] = useState(false);
  const { busy, error: saveError, setError, run } = useAction();
  const photo = useAction();

  useEffect(() => {
    if (!data) return;
    setName(data.display_name);
    setPosition(data.preferred_position ?? '');
    setPhone(data.phone ?? '');
  }, [data]);

  if (loading && !data) return <Loading />;

  const save = () =>
    run(async () => {
      if (!name.trim()) return setError('Enter your name.');
      await saveProfile(userId!, { display_name: name.trim(), preferred_position: position.trim() || null, phone: phone.trim() || null });
      await reload();
      setEditing(false);
    });
  const cancel = () => {
    setName(data?.display_name ?? '');
    setPosition(data?.preferred_position ?? '');
    setPhone(data?.phone ?? '');
    setError(null);
    setEditing(false);
  };

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
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel={avatarPath ? 'Change photo' : 'Add photo'} onPress={() => void changePhoto()}>
          <Avatar name={data?.display_name ?? name} path={avatarPath} size={96} />
        </Pressable>
        <Text style={font.title}>{data?.display_name}</Text>
        <Text style={font.small}>{session?.user.email}</Text>
        <View style={styles.photoActions}>
          <Button label={avatarPath ? 'Change Photo' : 'Add Photo'} icon="camera-outline" variant="ghost" size="sm" busy={photo.busy} onPress={() => void changePhoto()} />
          {avatarPath && <Button label="Remove" variant="ghost" size="sm" disabled={photo.busy} onPress={() => void removePhoto()} />}
        </View>
        <ErrorText error={photo.error} />
      </View>

      {editing ? (
        <Card>
          <Field label="Name" value={name} onChangeText={setName} maxLength={60} />
          <Field
            label="Position"
            value={position}
            onChangeText={setPosition}
            maxLength={40}
            placeholder="Forward / Defence"
            hint="Your preference, shown to a Manager when you ask to join. Your Team Position is set by the Manager."
          />
          <Field label="Phone" value={phone} onChangeText={setPhone} maxLength={30} keyboardType="phone-pad" placeholder="(555) 123-4567" />
          <ErrorText error={saveError} />
          <ButtonRow>
            <Button label="Cancel" variant="secondary" onPress={cancel} style={{ flex: 1 }} />
            <Button label="Save" busy={busy} onPress={() => void save()} style={{ flex: 1 }} />
          </ButtonRow>
        </Card>
      ) : (
        <Card flush>
          <ListRow
            first
            title="Position"
            subtitle={data?.preferred_position ?? 'Not set'}
            right={<Button label="Edit" variant="secondary" size="sm" onPress={() => setEditing(true)} />}
          />
          <ListRow title="Name" subtitle={data?.display_name} />
          <ListRow title="Email" subtitle={session?.user.email ?? ''} />
          <ListRow title="Phone" subtitle={data?.phone ?? 'Not set'} />
        </Card>
      )}

      <Card flush>
        <ListRow first title="Change Password" titleStyle={{ color: accent.ink }} onPress={() => router.push('/account')} />
        <ListRow title="Notification Preferences" titleStyle={{ color: accent.ink }} onPress={() => router.push('/account')} />
      </Card>

      <SectionLabel>Calendar</SectionLabel>
      <CalendarSubscribe />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: space.xs },
  photoActions: { flexDirection: 'row', gap: space.sm },
});
