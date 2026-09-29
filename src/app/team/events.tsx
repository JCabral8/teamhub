import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useAuth } from '../../lib/auth';
import { loadEvents, loadMyRosterLines, type MyRosterLine, type TeamEvent } from '../../lib/data';
import { useLoader, useRealtime } from '../../lib/hooks';
import { isManagerOf, useTeams } from '../../lib/teams';
import { Button, Card, Empty, ErrorText, Loading, Screen, TabBar } from '../../ui/components';
import { EventRow } from '../../ui/EventRow';
import { font, space } from '../../ui/theme';

/** Wireframe 5F "Team Schedule": one Team's Events, with Create Event for Managers. */
export default function TeamEvents() {
  const router = useRouter();
  const { userId } = useAuth();
  const teams = useTeams();
  const membership = teams.selected;
  const team = membership?.team;
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const { data, error, loading, reload } = useLoader(async () => {
    if (!team || !userId) return { events: [] as TeamEvent[], lines: new Map<string, MyRosterLine>() };
    const events = await loadEvents([team.id], { from: new Date(Date.now() - 365 * 86_400_000) });
    return { events, lines: await loadMyRosterLines(userId, events.map((e) => e.id)) };
  }, [team?.id, userId]);
  useRealtime(`team-events-${team?.id}`, team ? [{ table: 'events', filter: `team_id=eq.${team.id}` }] : [], () => void reload());

  if (teams.loading || (loading && !data)) return <Loading />;
  if (!team) return <Empty title="No Team selected" />;

  const cutoff = Date.now() - 3 * 3600_000;
  const events = data?.events ?? [];
  const listed = when === 'upcoming' ? events.filter((e) => new Date(e.starts_at).getTime() >= cutoff) : events.filter((e) => new Date(e.starts_at).getTime() < cutoff).reverse();

  return (
    <Screen
      onRefresh={reload}
      footer={
        isManagerOf(membership) ? (
          <Button label="Create Event" icon="add" onPress={() => router.push({ pathname: '/event/new', params: { teamId: team.id } })} />
        ) : undefined
      }
    >
      <Stack.Screen options={{ title: `${team.name} Schedule` }} />
      <ErrorText error={error} />
      <TabBar
        options={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
        ]}
        value={when}
        onChange={setWhen}
      />
      <Card bare>
        {listed.length ? (
          listed.map((e, i) => (
            <EventRow
              key={e.id}
              first={i === 0}
              event={e}
              timezone={team.timezone}
              teamName={team.name}
              myLine={data?.lines.get(e.id)}
              onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
            />
          ))
        ) : (
          <Text style={[font.small, { padding: space.lg }]}>{when === 'upcoming' ? 'No upcoming Events.' : 'No past Events.'}</Text>
        )}
      </Card>
    </Screen>
  );
}
