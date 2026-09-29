import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { rosterStatus, spotsForCallups, useEventData } from '../../../features/event/useEventData';
import type { CallupInvite } from '../../../lib/data';
import { Avatar } from '../../../ui/Avatar';
import { Badge, Button, Card, Empty, ErrorText, ListRow, Loading, Notice, ProgressBar, Screen, TabBar } from '../../../ui/components';
import { colors, font, space, type Tone } from '../../../ui/theme';
import { TeamAccent } from '../../../ui/TeamAccent';

type Status = 'Pending' | 'Accepted' | 'Declined' | 'Maybe' | 'Removed';
const TONE: Record<Status, Tone> = { Pending: 'attention', Accepted: 'positive', Declined: 'negative', Maybe: 'primary', Removed: 'neutral' };
const statusOf = (i: CallupInvite): Status =>
  i.closed_at && i.response !== 'YES' ? 'Removed' : i.response === 'YES' ? 'Accepted' : i.response === 'NO' ? 'Declined' : i.response === 'MAYBE' ? 'Maybe' : 'Pending';

/**
 * Wireframes 3A–3F and 8D–8F: callup invitations for one Event and how each one stands. The Manager
 * picks who to invite on the Invite Callups screen; tap a callup to change their status or remove them.
 */
export default function EventCallups() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload, teamsLoading, membership, manager } = useEventData(id);
  const [tab, setTab] = useState<'ALL' | Status>('ALL');

  if (teamsLoading || (loading && !data)) return <Loading />;
  if (!data || !membership) return <Empty title="Event not found" body={error ?? undefined} />;
  if (!manager || !data.team) return <Empty title="Callups are managed by Managers" />;

  const { detail, team } = data;
  const t = membership.team;
  const released = detail.event.release_state === 'RELEASED';
  const status = rosterStatus(detail, team, membership);
  const open = spotsForCallups(detail, team, membership);
  const positionName = new Map(team.positions.map((p) => [p.id, p.name]));
  const members = new Map(team.members.map((m) => [m.user_id, m]));
  // The latest invitation per person.
  const latest = [...new Map(detail.invites.map((i) => [i.user_id, i])).values()];
  const count = (s: Status) => latest.filter((i) => statusOf(i) === s).length;
  const shown = latest.filter((i) => tab === 'ALL' || statusOf(i) === tab);
  const mode = `${t.callup_mode === 'BASIC' ? 'Basic' : 'Advanced'} (${t.callup_selection_method === 'RANDOMIZED_ROTATION' ? 'Randomized' : 'Listed Order'})`;
  const attending = status.counts.goalies + status.counts.players;
  const capacity = status.openSpots === null ? null : status.coverage.reduce((s, c) => s + c.required, 0) + detail.event.callup_spots;

  return (
    <TeamAccent color={t.accent_color}>
      <Screen
        onRefresh={reload}
        footer={released ? <Button label={latest.length ? 'Invite More Callups' : 'Invite Callups'} onPress={() => router.push({ pathname: '/event/[id]/invite-callups', params: { id } })} /> : undefined}
      >
        <ErrorText error={error} />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/settings/[teamId]/[section]', params: { teamId: t.id, section: 'callups' } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
        >
          <Text style={[font.body, { flex: 1 }]}>
            <Text style={{ fontWeight: '700' }}>Mode: </Text>
            {mode}
          </Text>
          <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
        </Pressable>

        {!released && <Notice tone="neutral" icon="alarm-outline">Callups can be invited once attendance has been sent.</Notice>}
        {released && capacity !== null && (
          <Card>
            <Text style={font.heading}>Roster Status</Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text }}>
              {attending} / {capacity}
            </Text>
            <ProgressBar value={attending} max={capacity} tone={attending >= capacity ? 'positive' : 'attention'} />
            {attending >= capacity ? (
              <Notice tone="positive" title="Roster is full!" />
            ) : open > 0 ? (
              <Text style={font.small}>{`${open} ${open === 1 ? 'spot' : 'spots'} available for callups.`}</Text>
            ) : (
              <Text style={font.small}>Remaining spots are waiting on players who haven't answered.</Text>
            )}
          </Card>
        )}

        <TabBar
          options={[
            { value: 'ALL', label: `All (${latest.length})` },
            { value: 'Pending', label: `Pending (${count('Pending')})` },
            { value: 'Accepted', label: `Accepted (${count('Accepted')})` },
            { value: 'Declined', label: `Declined (${count('Declined')})` },
          ]}
          value={tab}
          onChange={setTab}
        />
        <Card flush>
          {shown.length ? (
            shown.map((inv, i) => {
              const m = members.get(inv.user_id);
              const s = statusOf(inv);
              return (
                <ListRow
                  key={inv.user_id}
                  first={i === 0}
                  title={m?.display_name ?? 'Former member'}
                  subtitle={[m?.position_id ? positionName.get(m.position_id) : null, inv.target_position_id ? `For ${positionName.get(inv.target_position_id) ?? 'a Position'}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                  leading={<Avatar name={m?.display_name ?? '?'} path={m?.avatar_path} size={32} />}
                  right={<Badge label={s} tone={TONE[s]} />}
                  onPress={() => router.push({ pathname: '/event/[id]/player/[userId]', params: { id, userId: inv.user_id } })}
                />
              );
            })
          ) : (
            <Text style={[font.small, { paddingVertical: space.lg }]}>{latest.length ? 'None in this list.' : 'No callups invited yet.'}</Text>
          )}
        </Card>
        <Notice tone="primary">When a callup accepts, they are automatically added to the Event as Attending.</Notice>
      </Screen>
    </TeamAccent>
  );
}
