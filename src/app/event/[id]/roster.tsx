import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { groupRosterByPosition, standingOf, type EventRosterEntry, type RosterStanding } from '../../../domain/index.ts';
import { AddPlayerSheet } from '../../../features/event/RosterSheets';
import { spotsForCallups, useEventData } from '../../../features/event/useEventData';
import { Avatar } from '../../../ui/Avatar';
import { Button, Card, Chips, Empty, ErrorText, ListRow, Loading, Notice, Screen, TabBar } from '../../../ui/components';
import { StandingPill } from '../../../ui/EventTypeIcon';
import { STANDING_DISPLAY } from '../../../ui/format';
import { font, space } from '../../../ui/theme';
import { TeamAccent } from '../../../ui/TeamAccent';

type Tab = 'roster' | 'callups' | 'pending';
type Filter = 'ALL' | RosterStanding;
const STANDINGS: RosterStanding[] = ['ATTENDING', 'NOT_ATTENDING', 'MAYBE', 'NO_RESPONSE', 'PENDING_APPROVAL'];

/**
 * Wireframes 8B "Roster View", 8C "Open Spots" and 4C "Pending List": everyone on the Event by
 * Position with their status, not attending at the bottom (spec §36). Manager only.
 */
export default function EventRoster() {
  const { id, status } = useLocalSearchParams<{ id: string; status?: string }>();
  const { data, error, loading, reload, teamsLoading, membership, manager } = useEventData(id);
  const initialFilter: Filter = STANDINGS.includes(status as RosterStanding) ? (status as RosterStanding) : 'ALL';
  const [tab, setTab] = useState<Tab>(initialFilter === 'PENDING_APPROVAL' ? 'pending' : 'roster');
  const [filter, setFilter] = useState<Filter>(initialFilter === 'PENDING_APPROVAL' ? 'ALL' : initialFilter);
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  if (teamsLoading || (loading && !data)) return <Loading />;
  if (!data || !membership) return <Empty title="Event not found" body={error ?? undefined} />;
  if (!manager || !data.team) return <Empty title="The full roster is for Managers" />;

  const { detail, team } = data;
  const released = detail.event.release_state === 'RELEASED';
  const openSpots = spotsForCallups(detail, team, membership);
  const positionName = new Map(team.positions.map((p) => [p.id, p.name]));
  const pending = detail.roster.filter((e) => standingOf(e) === 'PENDING_APPROVAL').sort((a, b) => (a.pendingSince ?? '').localeCompare(b.pendingSince ?? ''));
  const callupEntries = detail.roster.filter((e) => e.source === 'CALLUP');
  const regular = detail.roster.filter((e) => e.source !== 'CALLUP');
  const shown = (tab === 'callups' ? callupEntries : detail.roster).filter((e) => filter === 'ALL' || standingOf(e) === filter);

  const row = (e: EventRosterEntry, i: number, subtitle?: string | null) => (
    <ListRow
      key={e.userId}
      first={i === 0}
      title={e.displayName}
      subtitle={subtitle ?? (e.response === 'NO' ? e.reason : e.responseOrigin === 'SYSTEM_AVAILABILITY' ? 'Marked unavailable' : null)}
      leading={<Avatar name={e.displayName} path={detail.avatars[e.userId]} size={32} />}
      right={<StandingPill standing={standingOf(e)} released={released} short />}
      onPress={() => router.push({ pathname: '/event/[id]/player/[userId]', params: { id, userId: e.userId } })}
    />
  );

  return (
    <TeamAccent color={membership.team.accent_color}>
      <Screen onRefresh={reload} footer={<Button label="Add Player" icon="person-add-outline" variant="secondary" onPress={() => setAdding(true)} />}>
        <ErrorText error={error} />
        <TabBar
          options={[
            { value: 'roster', label: `Roster (${regular.length})` },
            { value: 'callups', label: `Callups (${callupEntries.length})` },
            ...(pending.length ? [{ value: 'pending' as const, label: `Pending (${pending.length})` }] : []),
          ]}
          value={tab}
          onChange={setTab}
        />

        {released && openSpots > 0 && tab !== 'pending' && (
          <Notice tone="negative" icon="people" title={`${openSpots} roster ${openSpots === 1 ? 'spot' : 'spots'} open`}>
            <Text style={font.small}>Invite callups to fill the open spots.</Text>
            <Button label="Invite Callups" size="sm" onPress={() => router.push({ pathname: '/event/[id]/invite-callups', params: { id } })} />
          </Notice>
        )}

        {tab === 'pending' ? (
          <>
            <Notice tone="attention" icon="time">
              These players said Yes after the roster filled, listed in the order they asked. Tap a player to approve or decline them.
            </Notice>
            <Card flush>{pending.map((e, i) => row(e, i, `#${i + 1} in line${e.positionId ? ` · ${positionName.get(e.positionId) ?? ''}` : ''}`))}</Card>
          </>
        ) : (
          <>
            {released && (
              <Chips
                options={[{ value: 'ALL' as Filter, label: 'All' }, ...STANDINGS.filter((s) => s !== 'PENDING_APPROVAL').map((s) => ({ value: s as Filter, label: STANDING_DISPLAY[s].label }))]}
                value={filter}
                onChange={setFilter}
              />
            )}
            {!shown.length ? (
              <Text style={font.small}>{tab === 'callups' ? 'No callups on this Event yet.' : 'No one here.'}</Text>
            ) : (
              groupRosterByPosition(shown, team.config).map((g) => (
                <View key={g.positionId ?? 'none'} style={{ gap: space.sm }}>
                  <Text style={font.heading}>{`${g.name} (${g.count})`}</Text>
                  <Card flush>{g.entries.map((e, i) => row(e, i))}</Card>
                </View>
              ))
            )}
          </>
        )}

        <AddPlayerSheet visible={adding} onClose={() => setAdding(false)} detail={detail} team={team} onAdded={() => void reload()} />
      </Screen>
    </TeamAccent>
  );
}
