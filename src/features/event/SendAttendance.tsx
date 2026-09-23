// Manager release controls (spec §26–§29): SEND ATTENDANCE opens SEND NOW / SCHEDULE LATER.
import { useState } from 'react';
import { Text, View } from 'react-native';
import { getSchedulableDateRange, getScheduleTimeOptions, isSchedulableDate, localDate, zonedToUtc } from '../../domain/index.ts';
import { api } from '../../lib/api';
import type { Team, TeamEvent } from '../../lib/data';
import { useAction } from '../../lib/hooks';
import { Button, ButtonRow, Card, Chips, ErrorText, Notice, Sheet } from '../../ui/components';
import { eventWhen, longDate } from '../../ui/format';
import { MonthCalendar } from '../../ui/MonthCalendar';
import { TimeField } from '../../ui/TimeField';
import { font, space } from '../../ui/theme';

export function SendAttendance({ event, team, onChanged }: { event: TeamEvent; team: Team; onChanged: () => void }) {
  // One sheet with two steps: stacking a second modal while the first closes is unreliable on iOS.
  const [step, setStep] = useState<'menu' | 'schedule' | null>(null);
  const { busy, error, run } = useAction();

  if (event.release_state === 'RELEASED') {
    // No timestamp of when it was sent (spec §28).
    return <Notice tone="positive" title="Attendance Sent">Players have been notified</Notice>;
  }

  const sendNow = () =>
    run(async () => {
      await api('sendAttendanceNow', { eventId: event.id });
      setStep(null);
      onChanged();
    });

  const holdOff = () =>
    run(async () => {
      await api('holdAttendance', { eventId: event.id });
      onChanged();
    });

  const scheduled = event.release_state === 'SCHEDULED' && event.release_at;
  return (
    <Card>
      <Text style={font.heading}>Attendance</Text>
      {scheduled ? (
        <Text style={font.small}>
          {event.release_action === 'NOTIFY_MANAGER'
            ? `Manual mode: you'll be reminded to send attendance on ${eventWhen(event.release_at!, team.timezone)}. It has not been sent.`
            : `Attendance will be sent automatically on ${eventWhen(event.release_at!, team.timezone)}.`}
        </Text>
      ) : (
        <Text style={font.small}>Attendance has not been sent. Players won't be asked until you send it.</Text>
      )}
      <Button label="Send Attendance" icon="paper-plane-outline" onPress={() => setStep('menu')} />
      {scheduled && <Button label="Hold Off" variant="ghost" busy={busy && !step} onPress={() => void holdOff()} />}
      <ErrorText error={!step ? error : null} />

      <Sheet visible={!!step} onClose={() => setStep(null)} title={step === 'schedule' ? 'Schedule Later' : 'Send Attendance'}>
        {step === 'schedule' ? (
          <ScheduleLater
            event={event}
            team={team}
            onClose={() => setStep('menu')}
            onDone={() => {
              setStep(null);
              onChanged();
            }}
          />
        ) : (
          <>
            <Button label="Send Now" icon="paper-plane" busy={busy} onPress={() => void sendNow()} />
            <Button label="Schedule Later" icon="calendar-outline" variant="secondary" onPress={() => setStep('schedule')} />
            <ErrorText error={error} />
          </>
        )}
      </Sheet>
    </Card>
  );
}

function ScheduleLater({ event, team, onClose, onDone }: { event: TeamEvent; team: Team; onClose: () => void; onDone: () => void }) {
  const startsAt = new Date(event.starts_at);
  const range = getSchedulableDateRange(new Date(), startsAt, team.timezone);
  const eventDate = localDate(startsAt, team.timezone);
  const options = getScheduleTimeOptions(team.release_time);
  const [date, setDate] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>(team.release_time); // Team default selected initially.
  const [custom, setCustom] = useState<string | null>(null);
  const { busy, error, setError, run } = useAction();
  const time = choice === 'CUSTOM' ? custom : choice;

  const submit = () =>
    run(async () => {
      if (!date) return setError('Choose a date.');
      if (!time) return setError('Choose a time.');
      const at = zonedToUtc(date, time, team.timezone);
      if (at <= new Date()) return setError('Choose a time in the future.');
      if (at >= startsAt) return setError('Attendance must be sent before the Event starts.');
      await api('scheduleAttendance', { eventId: event.id, date, time });
      onDone();
    });

  return (
    <>
      <Text style={font.body}>Event date: {longDate(eventDate)}</Text>
      <Text style={font.small}>The Event date is circled. Dates after the Event and past dates can't be chosen.</Text>
      <MonthCalendar
        initialDate={range.first}
        selected={date}
        marks={{ [eventDate]: { highlight: true, dot: true } }}
        isDisabled={(d) => !isSchedulableDate(d, range)}
        onSelect={setDate}
      />
      {date && <Text style={font.heading}>{longDate(date)}</Text>}
      <View style={{ gap: space.sm }}>
        <Text style={font.label}>Time</Text>
        <Chips options={[...options.map((o) => ({ value: o.time, label: o.label })), { value: 'CUSTOM', label: 'Custom Time' }]} value={choice} onChange={setChoice} />
        {choice === 'CUSTOM' && <TimeField label="Custom time" value={custom} onChange={setCustom} />}
      </View>
      <ErrorText error={error} />
      <ButtonRow>
        <Button label="Back" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button label="Schedule" busy={busy} disabled={!date || !time} onPress={() => void submit()} style={{ flex: 1 }} />
      </ButtonRow>
    </>
  );
}
