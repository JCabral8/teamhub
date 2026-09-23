import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '../../lib/auth';
import { loadEvents, loadMyRosterLines, loadNotifications, type MyRosterLine } from '../../lib/data';
import { useLoader, useRealtime } from '../../lib/hooks';
import { useTeams } from '../../lib/teams';
import { Button, ButtonRow, Card, Empty, ErrorText, ListRow, Loading, Notice, Screen, SectionLabel } from '../../ui/components';
import { EventRow } from '../../ui/EventRow';
import { font } from '../../ui/theme';

export default function Home() {
  const router = useRouter();
  const { userId } = useAuth();
  const teams = useTeams();
  const teamIds = teams.active.map((m) => m.team.id);

  const { data, error, loading, reload } = useLoader(async () => {
    if (!userId) return { events: [], lines: new Map<string, MyRosterLine>(), notes: [] };
    const events = await loadEvents(teamIds, { from: new Date() });
    const [lines, notes] = await Promise.all([loadMyRosterLines(userId, events.map((e) => e.id)), loadNotifications(20)]);
    return { events, lines, notes };
  }, [teamIds.join(','), userId]);

  useRealtime(`home-${userId}`, [{ table: 'notifications', filter: `user_id=eq.${userId}` }], () => {
    void reload();
    void teams.reload();
  });

  if (teams.loading || (loading && !data)) return <Loading />;

  const pending = teams.memberships.filter((m) => m.status === 'PENDING');
  if (!teams.active.length) {
    return (
      <Screen onRefresh={teams.reload}>
        {pending.map((m) => (
          <Notice key={m.id} tone="attention" title={`Waiting to join ${m.team.name}`}>
            A Manager needs to approve your request before you can see the Team.
          </Notice>
        ))}
        <Empty title="You're not on a Team yet" body="Join with the link your Manager sent you, or create a Team to manage.">
          <ButtonRow>
            <Button label="Join a Team" onPress={() => router.push('/team/join')} />
            <Button label="Create a Team" variant="secondary" onPress={() => router.push('/team/new')} />
          </ButtonRow>
        </Empty>
      </Screen>
    );
  }

  const tz = new Map(teams.active.map((m) => [m.team.id, m.team]));
  const events = data?.events ?? [];
  const needsAnswer = events.filter((e) => e.release_state === 'RELEASED' && data?.lines.get(e.id)?.response === 'NO_RESPONSE');
  const upcoming = events.filter((e) => !needsAnswer.includes(e)).slice(0, 5);
  const unread = (data?.notes ?? []).filter((n) => !n.read_at).slice(0, 5);
  const multiTeam = teams.active.length > 1;

  return (
    <Screen onRefresh={reload}>
      <ErrorText error={error ?? teams.error} />
      {pending.map((m) => (
        <Notice key={m.id} tone="attention" title={`Waiting to join ${m.team.name}`}>
          A Manager needs to approve your request.
        </Notice>
      ))}

      {needsAnswer.length > 0 && (
        <>
          <SectionLabel>Are you attending?</SectionLabel>
          <Card style={{ paddingVertical: 0 }}>
            {needsAnswer.map((e, i) => (
              <EventRow
                key={e.id}
                first={i === 0}
                event={e}
                timezone={tz.get(e.team_id)!.timezone}
                teamName={multiTeam ? tz.get(e.team_id)!.name : undefined}
                myLine={data?.lines.get(e.id)}
                onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
              />
            ))}
          </Card>
        </>
      )}

      <SectionLabel>Coming up</SectionLabel>
      <Card style={{ paddingVertical: upcoming.length ? 0 : undefined }}>
        {upcoming.length ? (
          upcoming.map((e, i) => (
            <EventRow
              key={e.id}
              first={i === 0}
              event={e}
              timezone={tz.get(e.team_id)!.timezone}
              teamName={multiTeam ? tz.get(e.team_id)!.name : undefined}
              myLine={data?.lines.get(e.id)}
              onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
            />
          ))
        ) : (
          <Text style={font.small}>Nothing scheduled.</Text>
        )}
      </Card>

      <SectionLabel right={<Button label="See all" variant="ghost" onPress={() => router.push('/notifications')} style={{ minHeight: 0, paddingHorizontal: 0 }} />}>
        Notifications
      </SectionLabel>
      <Card style={{ paddingVertical: unread.length ? 0 : undefined }}>
        {unread.length ? (
          unread.map((n, i) => (
            <ListRow
              key={n.id}
              first={i === 0}
              title={n.title}
              subtitle={n.body}
              onPress={() => (n.event_id ? router.push({ pathname: '/event/[id]', params: { id: n.event_id } }) : router.push('/notifications'))}
            />
          ))
        ) : (
          <Text style={font.small}>You're all caught up.</Text>
        )}
      </Card>
    </Screen>
  );
}
