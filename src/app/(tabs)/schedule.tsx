import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { addDays, localDate } from '../../domain/index.ts';
import { useAuth } from '../../lib/auth';
import {
  clearUnavailable,
  loadAvailability,
  loadEvents,
  loadMyCallups,
  loadMyRosterLines,
  type MyCallup,
  type MyRosterLine,
  type TeamEvent,
} from '../../lib/data';
import { useAction, useLoader } from '../../lib/hooks';
import { isManagerOf, useTeams } from '../../lib/teams';
import { Button, Card, Empty, ErrorText, Loading, Notice, Screen, Select, TabBar } from '../../ui/components';
import { EventRow } from '../../ui/EventRow';
import { EVENT_TYPE_STYLE } from '../../ui/EventTypeIcon';
import { deviceTimeZone, shortDate } from '../../ui/format';
import { CalendarLegend, MonthCalendar, type DayMark } from '../../ui/MonthCalendar';
import { colors, font, space } from '../../ui/theme';

type View_ = 'list' | 'calendar';

/** Wireframes "Schedule — List View" and "Schedule — Calendar View": every Team blended in date order. */
export default function Schedule() {
  const router = useRouter();
  const { userId } = useAuth();
  const teams = useTeams();
  const [view, setView] = useState<View_>('list');
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const today = localDate(new Date(), deviceTimeZone());
  const [selectedDate, setSelectedDate] = useState(today);
  const action = useAction();

  const teamIds = teams.active.map((m) => m.team.id);
  const { data, error, loading, reload } = useLoader(async () => {
    if (!userId) return { events: [] as TeamEvent[], lines: new Map<string, MyRosterLine>(), blocks: [], callups: new Map<string, MyCallup>() };
    const events = await loadEvents(teamIds, { from: new Date(Date.now() - 120 * 86_400_000) });
    const [lines, blocks, callups] = await Promise.all([loadMyRosterLines(userId, events.map((e) => e.id)), loadAvailability(), loadMyCallups()]);
    return { events, lines, blocks, callups };
  }, [teamIds.join(','), userId]);

  const teamById = useMemo(() => new Map(teams.active.map((m) => [m.team.id, m])), [teams.active]);
  const events = (data?.events ?? []).filter((e) => teamFilter === 'ALL' || e.team_id === teamFilter);
  const eventDate = (e: TeamEvent) => localDate(new Date(e.starts_at), teamById.get(e.team_id)?.team.timezone ?? 'UTC');

  const unavailable = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of data?.blocks ?? []) {
      for (let d = b.start_date; d <= b.end_date; d = addDays(d, 1)) map.set(d, b.id);
    }
    return map;
  }, [data?.blocks]);

  if (teams.loading || (loading && !data)) return <Loading />;
  if (!teams.active.length) return <Empty title="No schedule yet" body="Your schedule appears once a Manager approves you onto a Team." />;

  const marks: Record<string, DayMark> = {};
  for (const e of events) {
    const d = eventDate(e);
    marks[d] = { ...marks[d], dots: [...(marks[d]?.dots ?? []), EVENT_TYPE_STYLE[e.type].color] };
  }
  for (const d of unavailable.keys()) marks[d] = { ...marks[d], unavailable: true };

  const now = Date.now();
  const isPast = (e: TeamEvent) => new Date(e.starts_at).getTime() < now - 3 * 3600_000;
  const listed = when === 'upcoming' ? events.filter((e) => !isPast(e)) : events.filter(isPast).reverse();
  const dayEvents = events.filter((e) => eventDate(e) === selectedDate);
  const newEventTeam = teamFilter !== 'ALL' ? teamById.get(teamFilter) : teams.active.find(isManagerOf);
  const multiTeam = teams.active.length > 1;
  const typesShown = [...new Set(events.map((e) => e.type))];

  const row = (e: TeamEvent, i: number, hideDate = false) => {
    const m = teamById.get(e.team_id)!;
    return (
      <EventRow
        key={e.id}
        first={i === 0}
        event={e}
        hideDate={hideDate}
        timezone={m.team.timezone}
        teamName={m.team.name}
        showTeam={multiTeam && teamFilter === 'ALL'}
        accentColor={multiTeam ? m.team.accent_color : undefined}
        myLine={data?.lines.get(e.id)}
        myCallup={data?.callups.get(e.id)}
        onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
      />
    );
  };

  const clearDay = () =>
    action.run(async () => {
      const block = unavailable.get(selectedDate);
      if (block) await clearUnavailable(block);
      await reload();
    });

  const footer =
    newEventTeam && isManagerOf(newEventTeam) ? (
      <Button label="Create Event" icon="add" onPress={() => router.push({ pathname: '/event/new', params: { teamId: newEventTeam.team.id } })} />
    ) : undefined;

  return (
    <Screen onRefresh={reload} footer={footer}>
      <ErrorText error={error} />
      <TabBar
        options={[
          { value: 'list', label: 'List' },
          { value: 'calendar', label: 'Calendar' },
        ]}
        value={view}
        onChange={setView}
      />
      {multiTeam && (
        <View style={styles.filter}>
          <Select
            title="Show Teams"
            options={[{ value: 'ALL', label: 'All Teams' }, ...teams.active.map((m) => ({ value: m.team.id, label: m.team.name }))]}
            value={teamFilter}
            onChange={setTeamFilter}
          />
        </View>
      )}

      {view === 'list' ? (
        <>
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
              listed.map((e, i) => row(e, i))
            ) : (
              <Text style={[font.small, { padding: space.lg }]}>{when === 'upcoming' ? 'No upcoming Events.' : 'No past Events.'}</Text>
            )}
          </Card>
        </>
      ) : (
        <>
          <Card>
            <MonthCalendar initialDate={today} selected={selectedDate} marks={marks} onSelect={setSelectedDate} />
            <CalendarLegend
              items={[
                ...typesShown.map((t) => ({ color: EVENT_TYPE_STYLE[t].color, label: EVENT_TYPE_STYLE[t].label })),
                { color: colors.unavailable, label: 'Unavailable', square: true },
              ]}
            />
          </Card>
          <Text style={font.heading}>{shortDate(selectedDate)}</Text>
          {unavailable.has(selectedDate) && (
            <Notice tone="neutral" title="You're unavailable" icon="remove-circle">
              <Text style={font.small}>
                {blockText(data?.blocks.find((b) => b.id === unavailable.get(selectedDate)))} Attendance for Events on these dates is recorded as No when it is sent.
              </Text>
              <Button label="Clear Unavailable Dates" variant="neutral" size="sm" busy={action.busy} onPress={() => void clearDay()} style={{ alignSelf: 'flex-start' }} />
            </Notice>
          )}
          <Card bare>
            {dayEvents.length ? dayEvents.map((e, i) => row(e, i, true)) : <Text style={[font.small, { padding: space.lg }]}>No Events on this date.</Text>}
          </Card>
          <Button
            label="Mark Unavailable"
            icon="remove-circle-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/unavailable', params: { date: selectedDate >= today ? selectedDate : today } })}
          />
          <ErrorText error={action.error} />
        </>
      )}
    </Screen>
  );
}

function blockText(b: { start_date: string; end_date: string; reason: string | null } | undefined): string {
  if (!b) return '';
  const when = b.start_date === b.end_date ? shortDate(b.start_date, false) : `${shortDate(b.start_date, false)} – ${shortDate(b.end_date, false)}`;
  return `${when}${b.reason ? ` · ${b.reason}` : ''}.`;
}

const styles = StyleSheet.create({
  filter: { alignSelf: 'flex-end', minWidth: 170, marginTop: -space.xs, marginBottom: -space.xs },
});
