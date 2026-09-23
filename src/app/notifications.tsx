import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { useAuth } from '../lib/auth';
import { loadNotifications, markNotificationsRead } from '../lib/data';
import { useLoader, useRealtime } from '../lib/hooks';
import { Card, ErrorText, ListRow, Loading, Screen } from '../ui/components';
import { font } from '../ui/theme';

export default function Notifications() {
  const router = useRouter();
  const { userId } = useAuth();
  const { data, error, loading, reload } = useLoader(() => loadNotifications(100), []);
  useRealtime(`notifications-${userId}`, [{ table: 'notifications', filter: `user_id=eq.${userId}` }], () => void reload());

  useEffect(() => {
    const unread = (data ?? []).filter((n) => !n.read_at).map((n) => n.id);
    if (unread.length) markNotificationsRead(unread).catch(() => undefined);
  }, [data]);

  if (loading && !data) return <Loading />;
  const list = data ?? [];
  return (
    <Screen onRefresh={reload}>
      <ErrorText error={error} />
      <Card style={{ paddingVertical: list.length ? 0 : undefined }}>
        {list.length ? (
          list.map((n, i) => (
            <ListRow
              key={n.id}
              first={i === 0}
              title={`${n.read_at ? '' : '● '}${n.title}`}
              subtitle={n.body}
              onPress={n.event_id ? () => router.push({ pathname: '/event/[id]', params: { id: n.event_id! } }) : undefined}
            />
          ))
        ) : (
          <Text style={font.small}>No notifications yet.</Text>
        )}
      </Card>
    </Screen>
  );
}
