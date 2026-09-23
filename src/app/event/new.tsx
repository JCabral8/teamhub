import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { localDate, zonedToUtc } from '../../domain/index.ts';
import { EventForm, ReleaseDecisionSheet, emptyEventForm, eventFormError, eventFormParams } from '../../features/event/EventForm';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { isManagerOf, useTeams } from '../../lib/teams';
import { Button, Card, Chips, Empty, ErrorText, Loading, Screen, Segmented } from '../../ui/components';
import { longDate } from '../../ui/format';
import { MonthCalendar } from '../../ui/MonthCalendar';
import { TimeField } from '../../ui/TimeField';
import { font, space } from '../../ui/theme';

type CreateResult = { eventId: string; releaseDecisionRequired: boolean };

export default function NewEvent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ teamId?: string }>();
  const teams = useTeams();
  const managed = teams.active.filter(isManagerOf);
  const [picked, setTeamId] = useState<string | null>(null);
  const teamId = picked ?? params.teamId ?? managed[0]?.team.id ?? '';
  const membership = managed.find((m) => m.team.id === teamId);
  const [form, setForm] = useState(emptyEventForm);
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [date, setDate] = useState<string | null>(null);
  const [dates, setDates] = useState<Set<string>>(new Set());
  const [time, setTime] = useState<string | null>(null);
  const [needDecision, setNeedDecision] = useState<CreateResult[]>([]);
  const [created, setCreated] = useState<CreateResult[]>([]);
  const { busy, error, setError, run } = useAction();

  if (teams.loading) return <Loading />;
  if (!membership) return <Empty title="Only Managers can create Events" />;
  const team = membership.team;
  const today = localDate(new Date(), team.timezone);

  const finish = (results: CreateResult[]) => {
    if (results.length === 1) router.replace({ pathname: '/event/[id]', params: { id: results[0].eventId } });
    else router.back();
  };

  const submit = () =>
    run(async () => {
      const formError = eventFormError(form);
      if (formError) return setError(formError);
      if (!time) return setError('Enter a start time.');
      const fields = eventFormParams(form, team);
      let results: CreateResult[];
      if (mode === 'single') {
        if (!date) return setError('Choose a date.');
        const startsAt = zonedToUtc(date, time, team.timezone);
        results = [await api<CreateResult>('createEvent', { teamId, ...fields, startsAt: startsAt.toISOString() })];
      } else {
        if (!dates.size) return setError('Choose at least one date.');
        results = await api<CreateResult[]>('createEvents', { teamId, ...fields, time, dates: [...dates].sort() });
      }
      const pending = results.filter((r) => r.releaseDecisionRequired);
      setCreated(results);
      if (pending.length) setNeedDecision(pending);
      else finish(results);
    });

  const decide = (send: boolean) =>
    run(async () => {
      for (const r of needDecision) await api(send ? 'sendAttendanceNow' : 'holdAttendance', { eventId: r.eventId });
      setNeedDecision([]);
      finish(created);
    });

  const toggleDate = (d: string) => {
    const next = new Set(dates);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setDates(next);
  };

  return (
    <Screen>
      {managed.length > 1 && (
        <Chips options={managed.map((m) => ({ value: m.team.id, label: m.team.name }))} value={teamId} onChange={setTeamId} />
      )}
      <Card>
        <EventForm value={form} onChange={setForm} team={team} />
      </Card>
      <Card>
        <Segmented
          options={[
            { value: 'single', label: 'One Date' },
            { value: 'bulk', label: 'Multiple Dates' },
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === 'bulk' && <Text style={font.small}>Tap each date to add the same Event on all of them.</Text>}
        <MonthCalendar
          initialDate={today}
          selected={mode === 'single' ? date : dates}
          isDisabled={(d) => d < today}
          onSelect={mode === 'single' ? setDate : toggleDate}
        />
        <View style={{ gap: space.xs }}>
          {mode === 'single' && date && <Text style={font.heading}>{longDate(date)}</Text>}
          {mode === 'bulk' && dates.size > 0 && <Text style={font.heading}>{`${dates.size} ${dates.size === 1 ? 'date' : 'dates'} selected`}</Text>}
        </View>
        <TimeField label="Start time" value={time} onChange={setTime} hint={`Times are in the Team's time zone (${team.timezone}).`} />
      </Card>
      <ErrorText error={error} />
      <Button label={mode === 'bulk' && dates.size > 1 ? `Create ${dates.size} Events` : 'Create Event'} busy={busy && !needDecision.length} onPress={() => void submit()} />
      <ReleaseDecisionSheet
        count={needDecision.length}
        visible={needDecision.length > 0}
        busy={busy}
        onSendNow={() => void decide(true)}
        onHoldOff={() => void decide(false)}
      />
    </Screen>
  );
}
