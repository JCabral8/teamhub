import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { addDays, localDate } from '../../domain/index.ts';
import { useAuth } from '../../lib/auth';
import { clearUnavailable, loadAvailability, loadEvents, loadMyRosterLines, markUnavailable, type MyRosterLine } from '../../lib/data';
import { useAction, useLoader } from '../../lib/hooks';
import { isManagerOf, useTeams } from '../../lib/teams';
import { Button, Card, Chips, Empty, ErrorText, Loading, Notice, Screen, Segmented } from '../../ui/components';
import { EventRow } from '../../ui/EventRow';
import { deviceTimeZone, longDate } from '../../ui/format';
import { MonthCalendar, type DayMark } from '../../ui/MonthCalendar';
import { font } from '../../ui/theme';

type View = 'list' | 'calendar';

export default function Schedule() {
  const router = useRouter();
  const { userId } = useAuth();
  const teams = useTeams();
  const [view, setView] = useState<View>('list');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [showPast, setShowPast] = useState(false);
  const today = localDate(new Date(), deviceTimeZone());
  const [selectedDate, setSelectedDate] = useState(today);
  const action = useAction();

  const teamIds = teams.active.map((m) => m.team.id);
  const { data, error, loading, reload } = useLoader(async () => {
    if (!userId) return { events: [], lines: new Map<string, MyRosterLine>(), blocks: [] };
    const events = await loadEvents(teamIds, { from: new Date(Date.now() - 120 * 86_400_000) });
    const [lines, blocks] = await Promise.all([loadMyRosterLines(userId, events.map((e) => e.id)), loadAvailability()]);
    return { events, lines, blocks };
  }, [teamIds.join(','), userId]);

  const teamById = useMemo(() => new Map(teams.active.map((m) => [m.team.id, m])), [teams.active]);
  const events = (data?.events ?? []).filter((e) => teamFilter === 'ALL' || e.team_id === teamFilter);
  const eventDate = (e: (typeof events)[number]) => localDate(new Date(e.starts_at), teamById.get(e.team_id)?.team.timezone ?? 'UTC');

  const unavailable = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of data?.blocks ?? []) {
      for (let d = b.start_date; d <= b.end_date; d = addDays(d, 1)) map.set(d, b.id);
    }
    return map;
  }, [data?.blocks]);

  const marks: Record<string, DayMark> = {};
  for (const e of events) marks[eventDate(e)] = { ...marks[eventDate(e)], dot: true };
  for (const d of unavailable.keys()) marks[d] = { ...marks[d], unavailable: true };

  if (teams.loading || (loading && !data)) return <Loading />;
  if (!teams.active.length) return <Empty title="No schedule yet" body="Your schedule appears once a Manager approves you onto a Team." />;

  const now = Date.now();
  const listed = events.filter((e) => (showPast ? true : new Date(e.starts_at).getTime() >= now - 3 * 3600_000));
  const dayEvents = events.filter((e) => eventDate(e) === selectedDate);
  const managesAny = teams.active.some(isManagerOf);
  const newEventTeam = teamFilter !== 'ALL' ? teamById.get(teamFilter) : teams.active.find(isManagerOf);
  const multiTeam = teams.active.length > 1;

  const row = (e: (typeof events)[number], i: number) => (
    <EventRow
      key={e.id}
      first={i === 0}
      event={e}
      timezone={teamById.get(e.team_id)!.team.timezone}
      teamName={multiTeam && teamFilter === 'ALL' ? teamById.get(e.team_id)!.team.name : undefined}
      accentColor={multiTeam ? teamById.get(e.team_id)!.team.accent_color : undefined}
      myLine={data?.lines.get(e.id)}
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
    />
  );

  const toggleUnavailable = () =>
    action.run(async () => {
      const block = unavailable.get(selectedDate);
      if (block) await clearUnavailable(block);
      else await markUnavailable(selectedDate);
      await reload();
    });

  return (
    <Screen onRefresh={reload}>
      <ErrorText error={error} />
      {multiTeam && (
        <Chips
          options={[{ value: 'ALL', label: 'All Teams' }, ...teams.active.map((m) => ({ value: m.team.id, label: m.team.name }))]}
          value={teamFilter}
          onChange={setTeamFilter}
        />
      )}
      <Segmented
        options={[
          { value: 'list', label: 'List' },
          { value: 'calendar', label: 'Calendar' },
        ]}
        value={view}
        onChange={setView}
      />
      {managesAny && newEventTeam && isManagerOf(newEventTeam) && (
        <Button
          label="New Event"
          icon="add"
          variant="secondary"
          onPress={() => router.push({ pathname: '/event/new', params: { teamId: newEventTeam.team.id } })}
        />
      )}

      {view === 'list' ? (
        <>
          <Card style={{ paddingVertical: listed.length ? 0 : undefined }}>
            {listed.length ? listed.map(row) : <Text style={font.small}>No upcoming Events.</Text>}
          </Card>
          <Button label={showPast ? 'Hide past Events' : 'Show past Events'} variant="ghost" onPress={() => setShowPast(!showPast)} />
        </>
      ) : (
        <>
          <Card>
            <MonthCalendar initialDate={today} selected={selectedDate} marks={marks} onSelect={setSelectedDate} />
          </Card>
          <Text style={font.heading}>{longDate(selectedDate)}</Text>
          {unavailable.has(selectedDate) && (
            <Notice tone="negative" title="You're unavailable">
              Attendance for Events on this date is recorded as No when it is sent.
            </Notice>
          )}
          <Card style={{ paddingVertical: dayEvents.length ? 0 : undefined }}>
            {dayEvents.length ? dayEvents.map(row) : <Text style={font.small}>No Events on this date.</Text>}
          </Card>
          {selectedDate >= today && (
            <Button
              label={unavailable.has(selectedDate) ? 'Clear Unavailable' : 'Mark Unavailable'}
              variant={unavailable.has(selectedDate) ? 'secondary' : 'danger'}
              busy={action.busy}
              onPress={toggleUnavailable}
            />
          )}
          <ErrorText error={action.error} />
        </>
      )}
    </Screen>
  );
}
