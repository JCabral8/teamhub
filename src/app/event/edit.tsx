import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { EVENT_DATETIME_CHANGED_WARNING, handleEventChange, localDate, localTime, zonedToUtc } from '../../domain/index.ts';
import { EventForm, ReleaseDecisionSheet, eventFormError, eventFormParams, teamDefaultLocation, type EventFormValue } from '../../features/event/EventForm';
import { api } from '../../lib/api';
import { loadEventDetail } from '../../lib/data';
import { useAction, useLoader } from '../../lib/hooks';
import { isManagerOf, useTeams } from '../../lib/teams';
import { Button, Card, Empty, ErrorText, Loading, Notice, Screen, useConfirm } from '../../ui/components';
import { longDate } from '../../ui/format';
import { MonthCalendar } from '../../ui/MonthCalendar';
import { TimeField } from '../../ui/TimeField';
import { font } from '../../ui/theme';

export default function EditEvent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const teams = useTeams();
  const { data, loading, error: loadError } = useLoader(() => loadEventDetail(id, () => false), [id]);
  const [form, setForm] = useState<EventFormValue | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [askRelease, setAskRelease] = useState(false);
  const { busy, error, setError, run } = useAction();
  const confirm = useConfirm();

  const membership = data ? teams.active.find((m) => m.team.id === data.event.team_id) : undefined;
  const team = membership?.team;

  useEffect(() => {
    if (!data || !team || form) return;
    const e = data.event;
    const start = new Date(e.starts_at);
    setForm({
      type: e.type,
      name: e.name ?? '',
      opponent: e.opponent ?? '',
      customLocation: e.location === teamDefaultLocation(team) ? null : (e.location ?? ''),
      notes: e.notes ?? '',
    });
    setDate(localDate(start, team.timezone));
    setTime(localTime(start, team.timezone));
  }, [data, team, form]);

  if (teams.loading || (loading && !data)) return <Loading />;
  if (!data || !team) return <Empty title="Event not found" body={loadError ?? undefined} />;
  if (!isManagerOf(membership)) return <Empty title="Only Managers can edit Events" />;
  if (!form || !date) return <Loading />;

  const event = data.event;
  const released = event.release_state === 'RELEASED';
  const nextStart = time ? zonedToUtc(date, time, team.timezone) : null;
  const impact = nextStart ? handleEventChange({ startsAt: new Date(event.starts_at) }, { startsAt: nextStart }, team.timezone, released) : null;

  const save = () =>
    run(async () => {
      const formError = eventFormError(form);
      if (formError) return setError(formError);
      if (!nextStart) return setError('Enter a start time.');
      // Warn before saving a date or time change after release (spec §30).
      if (impact?.requiresNewRelease && !(await confirm.ask('Change date/time?', EVENT_DATETIME_CHANGED_WARNING, 'Save Change'))) return;
      const result = await api<{ warning: string | null; releaseDecisionRequired: boolean }>('updateEvent', {
        eventId: event.id,
        ...eventFormParams(form, team),
        startsAt: nextStart.toISOString(),
      });
      if (result.releaseDecisionRequired) setAskRelease(true);
      else router.back();
    });

  const decide = (send: boolean) =>
    run(async () => {
      await api(send ? 'sendAttendanceNow' : 'holdAttendance', { eventId: event.id });
      setAskRelease(false);
      router.back();
    });

  const remove = async () => {
    if (!(await confirm.ask('Delete this Event?', 'Everyone on the roster loses it from their schedule. This cannot be undone.', 'Delete Event', true))) return;
    await run(async () => {
      await api('deleteEvent', { eventId: event.id });
      router.dismissTo('/schedule');
    });
  };

  return (
    <Screen>
      <Card>
        <EventForm value={form} onChange={setForm} team={team} />
      </Card>
      <Card>
        <MonthCalendar initialDate={date} selected={date} onSelect={setDate} />
        <Text style={font.heading}>{longDate(date)}</Text>
        <TimeField label="Start time" value={time} onChange={setTime} hint={`Times are in the Team's time zone (${team.timezone}).`} />
      </Card>
      {impact?.requiresNewRelease && <Notice tone="attention">{EVENT_DATETIME_CHANGED_WARNING}</Notice>}
      <ErrorText error={error} />
      <Button label="Save Changes" busy={busy && !askRelease} onPress={() => void save()} />
      <Button label="Delete Event" variant="danger" onPress={() => void remove()} />
      <ReleaseDecisionSheet count={1} visible={askRelease} busy={busy} onSendNow={() => void decide(true)} onHoldOff={() => void decide(false)} />
      {confirm.element}
    </Screen>
  );
}
