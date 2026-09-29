import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { AddPlayerSheet, PlayerActionsSheet } from '../../../features/event/RosterSheets';
import { rosterStatus, useEventData } from '../../../features/event/useEventData';
import { useInviteCallups } from '../../../features/event/useInviteCallups';
import type { CallupInvite } from '../../../lib/data';
import { Avatar } from '../../../ui/Avatar';
import { Badge, Button, Card, Empty, ErrorText, ListRow, Loading, Notice, Screen, TabBar } from '../../../ui/components';
import { colors, font, space, type Tone } from '../../../ui/theme';
import { TeamAccent } from '../../../ui/TeamAccent';
import type { EventRosterEntry } from '../../../domain/index.ts';

type Status = 'Pending' | 'Accepted' | 'Declined' | 'Closed';
const TONE: Record<Status, Tone> = { Pending: 'attention', Accepted: 'positive', Declined: 'negative', Closed: 'neutral' };
const statusOf = (i: CallupInvite): Status => (i.response === 'YES' ? 'Accepted' : i.response === 'NO' ? 'Declined' : i.closed_at ? 'Closed' : 'Pending');

/**
 * Wireframes 3A–3F and 8D–8F: callup invitations for one Event and how each one stands. Callups are
 * chosen by the Team's callup mode, so Invite Callups fills the open spots from the callup list.
 */
export default function EventCallups() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload, teamsLoading, membership, manager } = useEventData(id);
  const [tab, setTab] = useState<'ALL' | Status>('ALL');
  const [selected, setSelected] = useState<EventRosterEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const callups = useInviteCallups(id, () => void reload());

  if (teamsLoading || (loading && !data)) return <Loading />;
  if (!data || !membership) return <Empty title="Event not found" body={error ?? undefined} />;
  if (!manager || !data.team) return <Empty title="Callups are managed by Managers" />;

  const { detail, team } = data;
  const t = membership.team;
  const released = detail.event.release_state === 'RELEASED';
  const status = rosterStatus(detail, team, membership);
  const positionName = new Map(team.positions.map((p) => [p.id, p.name]));
  const names = new Map(team.members.map((m) => [m.user_id, m]));
  const invites = detail.invites;
  const count = (s: Status) => invites.filter((i) => statusOf(i) === s).length;
  const shown = invites.filter((i) => tab === 'ALL' || statusOf(i) === tab);
  const mode = `${t.callup_mode === 'BASIC' ? 'Basic' : 'Advanced'} (${t.callup_selection_method === 'RANDOMIZED_ROTATION' ? 'Randomized' : 'Listed Order'})`;

  return (
    <TeamAccent color={t.accent_color}>
      <Screen
        onRefresh={reload}
        footer={
          released ? (
            <>
              <Button label="Invite Callups" busy={callups.busy} onPress={() => void callups.invite()} />
              <Button label="Add a Specific Player" variant="secondary" size="sm" onPress={() => setAdding(true)} />
            </>
          ) : undefined
        }
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

        {callups.result && <Notice tone="positive" title="Callup Invites Sent">{callups.result}</Notice>}
        <ErrorText error={callups.error} />
        {!released && <Notice tone="neutral" icon="alarm-outline">Callups are invited once attendance has been sent and a spot is open.</Notice>}
        {released && status.openSpots === 0 && invites.length > 0 && <Notice tone="positive" title="Roster is full!" />}

        <TabBar
          options={[
            { value: 'ALL', label: `All (${invites.length})` },
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
              const m = names.get(inv.user_id);
              const entry = detail.roster.find((r) => r.userId === inv.user_id);
              const s = statusOf(inv);
              return (
                <ListRow
                  key={`${inv.user_id}-${i}`}
                  first={i === 0}
                  title={m?.display_name ?? entry?.displayName ?? 'Former member'}
                  subtitle={[m?.position_id ? positionName.get(m.position_id) : null, inv.target_position_id ? `For ${positionName.get(inv.target_position_id) ?? 'a Position'}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                  leading={<Avatar name={m?.display_name ?? '?'} path={m?.avatar_path} size={32} />}
                  right={<Badge label={s} tone={TONE[s]} />}
                  onPress={entry ? () => setSelected(entry) : undefined}
                />
              );
            })
          ) : (
            <Text style={[font.small, { paddingVertical: space.lg }]}>{invites.length ? 'None in this list.' : 'No callups invited yet.'}</Text>
          )}
        </Card>
        <Notice tone="primary">When a callup accepts, they are automatically added to the Event as Attending.</Notice>

        <PlayerActionsSheet entry={selected} detail={detail} positionName={positionName} onClose={() => setSelected(null)} onChanged={() => void reload()} />
        <AddPlayerSheet visible={adding} onClose={() => setAdding(false)} detail={detail} team={team} onAdded={() => void reload()} />
      </Screen>
    </TeamAccent>
  );
}
