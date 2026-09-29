import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getSchedulableDateRange, getScheduleTimeOptions, isSchedulableDate, localDate, zonedToUtc } from '../../../domain/index.ts';
import { EventHeader } from '../../../features/event/EventHeader';
import { useEventData } from '../../../features/event/useEventData';
import { api } from '../../../lib/api';
import { useAction } from '../../../lib/hooks';
import { useAccent } from '../../../ui/accent';
import { Badge, Button, Card, Empty, ErrorText, Loading, Screen, SectionLabel } from '../../../ui/components';
import { clock, shortDate } from '../../../ui/format';
import { CalendarLegend, MonthCalendar } from '../../../ui/MonthCalendar';
import { colors, font, radius, space } from '../../../ui/theme';
import { TeamAccent } from '../../../ui/TeamAccent';
import { TimeField } from '../../../ui/TimeField';

/**
 * Wireframes 1C "Schedule Later – Select Date" and 1D "Select Time". Only today up to the Event date
 * can be picked; the time choices are the Team default with an hour either side, or a custom time.
 */
export default function ScheduleAttendance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const a = useAccent();
  const { data, error: loadError, loading, teamsLoading, membership, manager } = useEventData(id);
  const [step, setStep] = useState<'date' | 'time'>('date');
  const [date, setDate] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [custom, setCustom] = useState<string | null>(null);
  const { busy, error, setError, run } = useAction();

  if (teamsLoading || (loading && !data)) return <Loading />;
  if (!data || !membership) return <Empty title="Event not found" body={loadError ?? undefined} />;
  if (!manager) return <Empty title="Only Managers can schedule attendance" />;

  const { event } = data.detail;
  const team = membership.team;
  const startsAt = new Date(event.starts_at);
  const range = getSchedulableDateRange(new Date(), startsAt, team.timezone);
  const eventDate = localDate(startsAt, team.timezone);
  const options = getScheduleTimeOptions(team.release_time);
  const picked = choice ?? team.release_time;
  const time = picked === 'CUSTOM' ? custom : picked;

  const submit = () =>
    run(async () => {
      if (!date) return setError('Choose a date.');
      if (!time) return setError('Choose a time.');
      const at = zonedToUtc(date, time, team.timezone);
      if (at <= new Date()) return setError('Choose a time in the future.');
      if (at >= startsAt) return setError('Attendance must be sent before the Event starts.');
      await api('scheduleAttendance', { eventId: event.id, date, time });
      router.back();
    });

  return (
    <TeamAccent color={team.accent_color}>
      <Screen
        footer={
          step === 'date' ? (
            <Button label="Next" disabled={!date} onPress={() => setStep('time')} />
          ) : (
            <Button label="Schedule Attendance" busy={busy} disabled={!time} onPress={() => void submit()} />
          )
        }
      >
        <EventHeader event={event} team={team} compact />
        {step === 'date' ? (
          <>
            <SectionLabel>Select Send Date</SectionLabel>
            <Card>
              <MonthCalendar
                initialDate={range.first}
                selected={date}
                marks={{ [eventDate]: { highlight: true } }}
                isDisabled={(d) => !isSchedulableDate(d, range)}
                onSelect={setDate}
              />
              <CalendarLegend
                items={[
                  { color: a.accent, label: 'Selected send date', square: true },
                  { color: a.soft, label: `Event date (${shortDate(eventDate, false)})`, square: true },
                  { color: colors.surfaceMuted, label: 'Unavailable (past or after the Event)', square: true },
                ]}
              />
            </Card>
          </>
        ) : (
          <>
            <Card>
              <View style={styles.sendDate}>
                <View style={{ flex: 1 }}>
                  <Text style={font.label}>Send Date</Text>
                  <Text style={font.heading}>{date ? shortDate(date) : ''}</Text>
                </View>
                <Button label="Edit" variant="ghost" size="sm" onPress={() => setStep('date')} />
              </View>
            </Card>
            <SectionLabel>Select Send Time</SectionLabel>
            <View style={styles.times}>
              {options.map((o) => {
                const active = picked === o.time;
                const [h, m] = clock(o.time).split(' ');
                return (
                  <Pressable
                    key={o.time}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={o.label}
                    onPress={() => setChoice(o.time)}
                    style={[styles.time, o.isTeamDefault && styles.timeDefault, active && { borderColor: a.accent, backgroundColor: a.soft }]}
                  >
                    <Text style={[styles.timeText, o.isTeamDefault && { fontSize: 22 }, active && { color: a.ink }]}>{h}</Text>
                    <Text style={[font.small, active && { color: a.ink }]}>{m}</Text>
                    {o.isTeamDefault && <Badge label="Team Default" tone="primary" style={{ marginTop: space.xs }} />}
                  </Pressable>
                );
              })}
            </View>
            <Button label="Custom Time" variant={picked === 'CUSTOM' ? 'primary' : 'secondary'} onPress={() => setChoice('CUSTOM')} />
            {picked === 'CUSTOM' && <TimeField label="Custom time" value={custom} onChange={setCustom} hint={`In the Team's time zone (${team.timezone}).`} />}
            <Text style={font.small}>The default time comes from the Team's attendance settings; changing it here only affects this Event.</Text>
          </>
        )}
        <ErrorText error={error} />
      </Screen>
    </TeamAccent>
  );
}

const styles = StyleSheet.create({
  sendDate: { flexDirection: 'row', alignItems: 'center' },
  times: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  time: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  timeDefault: { paddingVertical: space.lg },
  timeText: { fontSize: 18, fontWeight: '700', color: colors.text },
});
