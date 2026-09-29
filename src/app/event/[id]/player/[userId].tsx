import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { localDate, standingOf, type PlayerAttendanceStats } from '../../../../domain/index.ts';
import { useEventData } from '../../../../features/event/useEventData';
import { api } from '../../../../lib/api';
import { useAction, useLoader } from '../../../../lib/hooks';
import { Avatar } from '../../../../ui/Avatar';
import {
  Badge,
  Button,
  Card,
  DetailLine,
  Dialog,
  Empty,
  ErrorText,
  Loading,
  Notice,
  RadioRow,
  Screen,
  SectionLabel,
} from '../../../../ui/components';
import { StandingPill } from '../../../../ui/EventTypeIcon';
import { matchTitle, shortDate, timeRange } from '../../../../ui/format';
import { colors, font, space, type Tone } from '../../../../ui/theme';
import { TeamAccent } from '../../../../ui/TeamAccent';

type CallupStatus = 'NO_RESPONSE' | 'YES' | 'NO';
const CALLUP_LABEL: Record<string, { label: string; tone: Tone }> = {
  NO_RESPONSE: { label: 'Pending', tone: 'attention' },
  YES: { label: 'Accepted', tone: 'positive' },
  NO: { label: 'Declined', tone: 'negative' },
  MAYBE: { label: 'Maybe', tone: 'primary' },
};

/**
 * One person on an Event, for Managers: "Pending Player" (wireframe 4D) to approve or decline,
 * "Callup Details" (3E, 3F) to set a callup's status or take them off the list, or a roster player.
 */
export default function EventPlayer() {
  const { id, userId } = useLocalSearchParams<{ id: string; userId: string }>();
  const router = useRouter();
  const { data, error: loadError, loading, reload, teamsLoading, membership, manager } = useEventData(id);
  // Only what the Manager picked; otherwise the radios follow the callup's live answer.
  const [picked, setPicked] = useState<CallupStatus | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const act = useAction();
  const teamId = membership?.team.id;
  const stats = useLoader(
    async () => (teamId && manager ? (await api<(PlayerAttendanceStats & { displayName: string })[]>('getAttendanceStatistics', { teamId })).find((s) => s.userId === userId) ?? null : null),
    [teamId, userId, manager],
  );

  const entry = data?.detail.roster.find((r) => r.userId === userId);
  const invite = data?.detail.invites.filter((i) => i.user_id === userId).at(-1);
  const status: CallupStatus | null = picked ?? (entry && entry.response !== 'MAYBE' ? entry.response : null);

  if (teamsLoading || (loading && !data)) return <Loading />;
  if (!data || !membership) return <Empty title="Event not found" body={loadError ?? undefined} />;
  if (!manager || !data.team) return <Empty title="Player details are for Managers" />;
  const member = data.team.members.find((m) => m.user_id === userId);
  if (!entry && !invite) return <Empty title="Not on this Event" body="They may have been removed." />;

  const { event } = data.detail;
  const team = membership.team;
  const positionName = new Map(data.team.positions.map((p) => [p.id, p.name]));
  const name = entry?.displayName ?? member?.display_name ?? 'Player';
  const position = entry?.positionId ? positionName.get(entry.positionId) : member?.position_id ? positionName.get(member.position_id) : null;
  const standing = entry ? standingOf(entry) : null;
  const pending = standing === 'PENDING_APPROVAL';
  const callup = entry?.source === 'CALLUP' || (!entry && !!invite);
  const released = event.release_state === 'RELEASED';

  const exec = (command: string, params: Record<string, unknown> = {}, leave = true) =>
    act.run(async () => {
      await api(command, { eventId: event.id, userId, ...params });
      await reload();
      if (leave) router.back();
    });

  const c = stats.data?.callup;
  const rate = c && c.invitations ? `${Math.round((c.accepted / c.invitations) * 100)}%` : '—';

  return (
    <TeamAccent color={team.accent_color}>
      <Stack.Screen options={{ title: pending ? 'Pending Player' : callup ? 'Callup Details' : 'Player' }} />
      <Screen
        footer={
          pending ? (
            <>
              <Button label="Approve and Add" variant="success" busy={act.busy} onPress={() => void exec('approvePendingPlayer')} />
              <Button label="Decline" variant="danger" disabled={act.busy} onPress={() => void exec('declinePendingPlayer')} />
            </>
          ) : callup && entry ? (
            <>
              <Button
                label="Save Changes"
                busy={act.busy}
                disabled={!picked || picked === entry.response}
                onPress={() => void exec('setCallupResponse', { response: picked }, false).then(() => setPicked(null))}
              />
              <Button label="Remove from Callup List" variant="danger" onPress={() => setConfirmRemove(true)} />
            </>
          ) : entry ? (
            <Button label="Remove from Event" variant="danger" onPress={() => setConfirmRemove(true)} />
          ) : undefined
        }
      >
        <View style={styles.head}>
          <Avatar name={name} path={data.detail.avatars[userId] ?? member?.avatar_path} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={font.title}>{name}</Text>
            <Text style={font.body}>{position ?? 'No Position'}</Text>
          </View>
        </View>

        <Card>
          <Text style={[font.body, { fontWeight: '700' }]}>Event</Text>
          <Text style={font.heading}>{matchTitle(event, team.name)}</Text>
          <DetailLine icon="calendar-outline">{`${shortDate(localDate(new Date(event.starts_at), team.timezone))} • ${timeRange(event, team.timezone)}`}</DetailLine>
          {event.location ? <DetailLine icon="location-outline">{event.location}</DetailLine> : null}
        </Card>

        <Card>
          <View style={styles.statusRow}>
            <Text style={[font.body, { fontWeight: '700', flex: 1 }]}>{pending ? 'Current Status' : 'Status'}</Text>
            {callup && entry ? (
              <Badge label={CALLUP_LABEL[entry.response].label} tone={CALLUP_LABEL[entry.response].tone} />
            ) : standing ? (
              <StandingPill standing={standing} released={released} short />
            ) : (
              <Badge label="Removed" tone="neutral" />
            )}
          </View>
          {entry?.response === 'NO' && entry.reason ? <Text style={font.small}>Reason: {entry.reason}</Text> : null}
          {entry?.responseOrigin === 'SYSTEM_AVAILABILITY' ? <Text style={font.small}>Marked unavailable for this date.</Text> : null}
          {invite && callup ? (
            <View>
              <Text style={[font.body, { fontWeight: '700' }]}>Invited as Callup</Text>
              <Text style={font.body}>{shortDate(localDate(new Date(invite.invited_at), team.timezone))}</Text>
            </View>
          ) : null}
        </Card>

        {pending && (
          <Card>
            <Text style={[font.body, { fontWeight: '700' }]}>Roster Impact</Text>
            <Text style={font.body}>Approving this player adds them to the event roster, even if that puts it over the requirements. You may want to remove a callup if one was used.</Text>
          </Card>
        )}

        {callup && entry && (
          <>
            <SectionLabel>Update Status</SectionLabel>
            <Card>
              {(['NO_RESPONSE', 'YES', 'NO'] as CallupStatus[]).map((s) => (
                <RadioRow key={s} label={CALLUP_LABEL[s].label} selected={status === s} onPress={() => setPicked(s)} />
              ))}
            </Card>
          </>
        )}

        {callup && c && (
          <>
            <SectionLabel>Invitations</SectionLabel>
            <Card>
              {[
                ['Accepted', c.accepted],
                ['Declined', c.declined],
                ['Maybe', c.maybe],
                ['No Response', c.noResponse],
              ].map(([label, value]) => (
                <View key={label} style={styles.stat}>
                  <Text style={[font.body, { flex: 1 }]}>{label}</Text>
                  <Text style={styles.statValue}>{value}</Text>
                </View>
              ))}
              <View style={[styles.stat, styles.statTotal]}>
                <Text style={[font.body, { flex: 1, fontWeight: '700' }]}>Acceptance Rate</Text>
                <Text style={styles.statValue}>{rate}</Text>
              </View>
            </Card>
          </>
        )}

        {!pending && callup && entry?.response === 'YES' && <Notice tone="positive">Accepted callups are on the Event as Attending.</Notice>}
        <ErrorText error={act.error} />

        <Dialog
          visible={confirmRemove}
          onClose={() => setConfirmRemove(false)}
          title={callup ? 'Remove from Callup List?' : `Remove ${name}?`}
          body={callup ? `${name} will be removed from the callup list for this event.` : `${name} will be taken off this Event's roster.`}
        >
          <View style={{ gap: space.sm }}>
            <Button label="Remove" variant="destructive" busy={act.busy} onPress={() => void exec('removeEventPlayer')} />
            <Button label="Cancel" variant="secondary" onPress={() => setConfirmRemove(false)} />
          </View>
        </Dialog>
      </Screen>
    </TeamAccent>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stat: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  statTotal: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm, marginTop: space.xs },
  statValue: { fontSize: 15, fontWeight: '700', color: colors.text },
});
