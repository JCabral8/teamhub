import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { loadNotifications, markNotificationsRead, type AppNotification } from '../lib/data';
import { useLoader, useRealtime } from '../lib/hooks';
import { Card, ErrorText, IconCircle, Loading, Screen, type IconName } from '../ui/components';
import { colors, font, space } from '../ui/theme';

const LOOK: Record<string, { icon: IconName; color: string; bg: string }> = {
  NEW_EVENT: { icon: 'calendar', color: '#E0383B', bg: '#FDE6E6' },
  EVENT_INVITATION: { icon: 'calendar', color: colors.primary, bg: colors.primarySoft },
  ATTENDANCE_REMINDER: { icon: 'alarm', color: colors.primary, bg: colors.primarySoft },
  ATTENDANCE_READY: { icon: 'paper-plane', color: colors.primary, bg: colors.primarySoft },
  ATTENDANCE_SENT: { icon: 'paper-plane', color: colors.positive, bg: colors.positiveSoft },
  CALLUP_INVITATION: { icon: 'trophy', color: colors.primary, bg: colors.primarySoft },
  CALLUP_CONFIRMED: { icon: 'trophy', color: colors.positive, bg: colors.positiveSoft },
  CALLUP_ACCEPTED: { icon: 'checkmark-circle', color: colors.positive, bg: colors.positiveSoft },
  ROSTER_SPOT_CONFIRMED: { icon: 'checkmark-circle', color: colors.positive, bg: colors.positiveSoft },
  CALLUP_DECLINED: { icon: 'close-circle', color: colors.negative, bg: colors.negativeSoft },
  CALLUP_NO_LONGER_NEEDED: { icon: 'checkmark-done', color: colors.textMuted, bg: colors.surfaceMuted },
  NOT_SELECTED: { icon: 'information-circle', color: colors.textMuted, bg: colors.surfaceMuted },
  PENDING_APPROVAL: { icon: 'time', color: colors.attention, bg: colors.attentionSoft },
  ATTENDANCE_DISCREPANCY: { icon: 'time', color: colors.attention, bg: colors.attentionSoft },
  MEMBERSHIP_REQUEST: { icon: 'person-add', color: '#7C4DDB', bg: '#EFE8FC' },
};
const DEFAULT_LOOK = { icon: 'notifications' as IconName, color: colors.primary, bg: colors.primarySoft };

/** "now", "5m ago", "3h ago", "2d ago", then the date. */
function ago(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / 1440)}d ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
}

/** Notifications, laid out like the "Notification Examples" in wireframes 6 and 7. */
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
      {list.length ? (
        <Card bare>
          {list.map((n, i) => (
            <Row key={n.id} n={n} first={i === 0} onPress={n.event_id ? () => router.push({ pathname: '/event/[id]', params: { id: n.event_id! } }) : undefined} />
          ))}
        </Card>
      ) : (
        <Card>
          <Text style={font.small}>No notifications yet.</Text>
        </Card>
      )}
    </Screen>
  );
}

function Row({ n, first, onPress }: { n: AppNotification; first: boolean; onPress?: () => void }) {
  const look = LOOK[n.type] ?? DEFAULT_LOOK;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.divider, !n.read_at && styles.unread, pressed && { opacity: 0.7 }]}
    >
      <IconCircle icon={look.icon} color={look.color} bg={look.bg} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.top}>
          <Text style={styles.app}>TeamHub</Text>
          <Text style={font.small}>{ago(n.created_at)}</Text>
        </View>
        <Text style={[font.body, { fontWeight: '700' }]}>{n.title}</Text>
        <Text style={font.small}>{n.body}</Text>
      </View>
      {!n.read_at && <View style={styles.dot} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, padding: space.lg, alignItems: 'flex-start' },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  unread: { backgroundColor: '#F7FAFF' },
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  app: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
});
