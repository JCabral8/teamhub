import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { standingOf, type EventRosterEntry, type RosterStanding } from '../../../domain/index.ts';
import { AttendanceSummary } from '../../../features/event/AttendanceSummary';
import { AdditionalInfo, EventHeader } from '../../../features/event/EventHeader';
import { usePlayerAttendance } from '../../../features/event/PlayerAttendance';
import { SendAttendance } from '../../../features/event/SendAttendance';
import { hasCustomRequirements, rosterStatus, useEventData } from '../../../features/event/useEventData';
import { useAuth } from '../../../lib/auth';
import type { EventDetail } from '../../../lib/data';
import { Avatar } from '../../../ui/Avatar';
import { Button, Card, Empty, ErrorText, ListRow, Loading, Notice, Screen, SectionLabel } from '../../../ui/components';
import { StandingPill } from '../../../ui/EventTypeIcon';
import { matchTitle } from '../../../ui/format';
import { font, space } from '../../../ui/theme';
import { TeamAccent } from '../../../ui/TeamAccent';

/**
 * Event Details. Players answer here (wireframes 6B–6E); Managers see attendance, the summary and
 * links into the roster and callups (wireframes 1A–1F, 3A, 9).
 */
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userId } = useAuth();
  const { data, error, loading, reload, teamsLoading, membership, manager, multiTeam } = useEventData(id);
  const detail = data?.detail;
  const mine = detail?.roster.find((r) => r.userId === userId);
  const released = detail?.event.release_state === 'RELEASED';
  const player = usePlayerAttendance({
    eventId: id,
    eventTitle: detail && membership ? matchTitle(detail.event, membership.team.name) : '',
    entry: mine,
    callup: data?.myCallup,
    released,
    isManager: manager,
    onChanged: () => void reload(),
  });

  if (teamsLoading || (loading && !data)) return <Loading />;
  if (!data || !detail) return <Empty title="Event not found" body={error ?? 'It may have been deleted.'} />;
  if (!membership) return <Empty title="Event not available" body="You're not an active member of this Team." />;

  const { event } = detail;
  const team = membership.team;
  const go = (pathname: '/event/[id]/roster' | '/event/[id]/callups' | '/event/[id]/roster-settings', params: Record<string, string> = {}) =>
    router.push({ pathname, params: { id: event.id, ...params } });

  return (
    <TeamAccent color={team.accent_color}>
      <Screen onRefresh={reload} footer={player.footer}>
        <Stack.Screen
          options={{
            title: player.title ?? 'Event Details',
            headerRight: manager
              ? () => <Button label="Edit" variant="secondary" size="sm" onPress={() => router.push({ pathname: '/event/edit', params: { id: event.id } })} style={{ marginRight: space.md }} />
              : undefined,
          }}
        />
        <ErrorText error={error} />
        <EventHeader event={event} team={team} showTeamName={multiTeam} />

        {manager && data.team && hasCustomRequirements(detail, data.team, membership) && (
          <Notice tone="attention" title="Custom Roster for This Event" icon="options">
            <Text style={font.small}>
              {`This Event uses its own Position requirements${event.callup_spots ? ` with ${event.callup_spots} callup ${event.callup_spots === 1 ? 'spot' : 'spots'}` : ''}. The Team defaults are unchanged.`}
            </Text>
            <Button label="Edit Roster Settings" variant="secondary" size="sm" onPress={() => go('/event/[id]/roster-settings')} style={{ alignSelf: 'flex-start' }} />
          </Notice>
        )}

        {player.body && (
          <Card>
            {!manager && (
              <View>
                <Text style={font.label}>Team</Text>
                <Text style={font.body}>{team.name}</Text>
              </View>
            )}
            {player.body}
          </Card>
        )}

        {manager && data.team ? (
          <ManagerSections detail={detail} released={released} status={rosterStatus(detail, data.team, membership)} go={go} onChanged={() => void reload()} team={team} />
        ) : (
          <PlayerLists detail={detail} released={released} />
        )}

        {event.notes ? (
          <Card>
            <AdditionalInfo notes={event.notes} />
          </Card>
        ) : null}
      </Screen>
    </TeamAccent>
  );
}

function ManagerSections({
  detail,
  released,
  status,
  go,
  onChanged,
  team,
}: {
  detail: EventDetail;
  released: boolean;
  status: ReturnType<typeof rosterStatus>;
  go: (pathname: '/event/[id]/roster' | '/event/[id]/callups' | '/event/[id]/roster-settings', params?: Record<string, string>) => void;
  onChanged: () => void;
  team: Parameters<typeof SendAttendance>[0]['team'];
}) {
  const { event, roster, invites } = detail;
  const count = (s: RosterStanding) => roster.filter((e) => standingOf(e) === s).length;
  const openRow = (standing: RosterStanding) => () => go('/event/[id]/roster', { status: standing });
  const pending = count('PENDING_APPROVAL');

  return (
    <>
      <SectionLabel>Attendance</SectionLabel>
      <SendAttendance event={event} team={team} onChanged={onChanged} />
      {released && <AttendanceSummary status={status} released={released} callupSpots={event.callup_spots} />}
      {released && pending > 0 && (
        <Notice tone="attention" title="Pending Approval" icon="time">
          <Text style={font.small}>{`${pending} ${pending === 1 ? 'player said' : 'players said'} Yes after the roster filled. Approve or decline them.`}</Text>
          <Button label="Review Pending Players" variant="secondary" size="sm" onPress={openRow('PENDING_APPROVAL')} style={{ alignSelf: 'flex-start' }} />
        </Notice>
      )}
      <Card flush>
        {released ? (
          <>
            <ListRow first strong title={`Attending (${count('ATTENDING')})`} onPress={openRow('ATTENDING')} />
            <ListRow strong title={`Not Attending (${count('NOT_ATTENDING')})`} onPress={openRow('NOT_ATTENDING')} />
            <ListRow strong title={`Maybe (${count('MAYBE')})`} onPress={openRow('MAYBE')} />
            <ListRow strong title={`No Response (${count('NO_RESPONSE')})`} onPress={openRow('NO_RESPONSE')} />
            <ListRow strong title={`Pending Approval (${pending})`} highlighted={pending > 0} onPress={openRow('PENDING_APPROVAL')} />
          </>
        ) : (
          <ListRow first strong title={`Default Roster (${roster.length})`} onPress={() => go('/event/[id]/roster')} />
        )}
        <ListRow strong title={`Callups (${invites.length})`} onPress={() => go('/event/[id]/callups')} />
        <ListRow strong title="Roster Settings" onPress={() => go('/event/[id]/roster-settings')} />
      </Card>
    </>
  );
}

const byName = (a: EventRosterEntry, b: EventRosterEntry) => a.displayName.localeCompare(b.displayName);

/** Players see names and answers only: no Positions and nothing that marks a callup (spec §44, §45, §47). */
function PlayerLists({ detail, released }: { detail: EventDetail; released: boolean }) {
  const { roster } = detail;
  if (!roster.length) return null;
  if (!released) {
    return (
      <>
        <SectionLabel>{`Roster (${roster.length})`}</SectionLabel>
        <Card flush>
          {[...roster].sort(byName).map((e, i) => (
            <ListRow key={e.userId} first={i === 0} title={e.displayName} leading={<Avatar name={e.displayName} path={detail.avatars[e.userId]} size={30} />} />
          ))}
        </Card>
      </>
    );
  }
  const groups: { standing: RosterStanding; title: string }[] = [
    { standing: 'ATTENDING', title: 'Attending' },
    { standing: 'PENDING_APPROVAL', title: 'Pending Approval' },
    { standing: 'MAYBE', title: 'Maybe' },
    { standing: 'NOT_ATTENDING', title: 'Not Attending' },
    { standing: 'NO_RESPONSE', title: 'No Response' },
  ];
  return (
    <>
      {groups.map((g) => {
        const list = roster.filter((e) => standingOf(e) === g.standing).sort(byName);
        if (!list.length) return null;
        return (
          <View key={g.standing} style={{ gap: space.lg }}>
            <SectionLabel>{`${g.title} (${list.length})`}</SectionLabel>
            <Card flush>
              {list.map((e, i) => (
                <ListRow
                  key={e.userId}
                  first={i === 0}
                  title={e.displayName}
                  subtitle={e.response === 'NO' ? e.reason : null}
                  leading={<Avatar name={e.displayName} path={detail.avatars[e.userId]} size={30} />}
                  right={g.standing === 'PENDING_APPROVAL' || g.standing === 'MAYBE' ? <StandingPill standing={g.standing} short /> : undefined}
                />
              ))}
            </Card>
          </View>
        );
      })}
    </>
  );
}
