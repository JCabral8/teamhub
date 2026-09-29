import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { localDate, sortPositions, zonedToUtc, type EventType } from '../../domain/index.ts';
import {
  EventForm,
  EVENT_TYPE_SELECT,
  ReleaseDecisionSheet,
  emptyEventForm,
  endInstant,
  eventFormError,
  eventFormParams,
  type EventFormValue,
} from '../../features/event/EventForm';
import { api } from '../../lib/api';
import { loadTeamDetail, type Team, type TeamDetail } from '../../lib/data';
import { useAction, useLoader } from '../../lib/hooks';
import { isManagerOf, useTeams } from '../../lib/teams';
import {
  Button,
  ButtonRow,
  Card,
  CheckRow,
  DetailLine,
  Empty,
  ErrorText,
  FieldButton,
  HeaderBack,
  ListRow,
  Loading,
  Notice,
  Screen,
  Segmented,
  Select,
  Sheet,
  StepperRow,
  SuccessState,
  ToggleRow,
} from '../../ui/components';
import { EVENT_TYPE_STYLE, EventTypeIcon } from '../../ui/EventTypeIcon';
import { clock, matchTitle, shortDate } from '../../ui/format';
import { MonthCalendar } from '../../ui/MonthCalendar';
import { colors, font, space } from '../../ui/theme';
import { TeamAccent } from '../../ui/TeamAccent';
import { TimeField } from '../../ui/TimeField';

type CreateResult = { eventId: string; releaseDecisionRequired: boolean };
type Step = 'type' | 'details' | 'roster' | 'review' | 'done';
const PREVIOUS: Partial<Record<Step, Step>> = { details: 'type', roster: 'details', review: 'roster' };
const TITLES: Record<Step, string> = { type: 'Create Event', details: 'Create Event', roster: 'Create Event', review: 'Review Event', done: 'Event Created' };

/**
 * Wireframe 5 "Event Creation": pick the type, enter the details, choose the Team and roster, review,
 * then create. Several dates at once make one Event per date (spec §14).
 */
export default function NewEvent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ teamId?: string }>();
  const teams = useTeams();
  const managed = teams.active.filter(isManagerOf);
  const [step, setStep] = useState<Step>('type');
  const [picked, setTeamId] = useState<string | null>(null);
  const teamId = picked ?? params.teamId ?? managed[0]?.team.id ?? '';
  const membership = managed.find((m) => m.team.id === teamId);
  const [form, setForm] = useState<EventFormValue>(emptyEventForm);
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [date, setDate] = useState<string | null>(null);
  const [dates, setDates] = useState<Set<string>>(new Set());
  const [pickingDate, setPickingDate] = useState(false);
  const [time, setTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [useDefaultRoster, setUseDefaultRoster] = useState(true);
  const [custom, setCustom] = useState<Record<string, number>>({});
  const [customCallupSpots, setCustomCallupSpots] = useState(0);
  const [notifyPlayers, setNotifyPlayers] = useState<boolean | null>(null);
  const [showDefaults, setShowDefaults] = useState(false);
  const [needDecision, setNeedDecision] = useState<CreateResult[]>([]);
  const [created, setCreated] = useState<CreateResult[]>([]);
  const { busy, error, setError, run } = useAction();
  const { data: detail } = useLoader(async () => (membership ? loadTeamDetail(membership.team, true) : null), [teamId]);

  const editable = detail ? sortPositions(detail.positions).filter((p) => p.kind === 'BASE' || (p.kind === 'GOALIE' && detail.config.goalieEnabled)) : [];
  // Start the custom quantities from the Team default once per Team, not on every reload.
  const [customFor, setCustomFor] = useState<string | null>(null);
  useEffect(() => {
    if (!detail || customFor === teamId) return;
    setCustom(Object.fromEntries(editable.map((p) => [p.id, detail.requirements.find((r) => r.positionId === p.id)?.quantity ?? 0])));
    const m = managed.find((x) => x.team.id === teamId);
    setCustomCallupSpots(m?.team.include_callups ? m.team.callup_spots : 0);
    setCustomFor(teamId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, teamId]);

  if (teams.loading) return <Loading />;
  if (!membership) return <Empty title="Only Managers can create Events" />;
  const team = membership.team;
  const today = localDate(new Date(), team.timezone);
  const sortedDates = [...dates].sort();
  const notify = notifyPlayers ?? team.notify_new_events;

  const detailsError = (): string | null => {
    const formError = eventFormError(form);
    if (formError) return formError;
    if (mode === 'single' && !date) return 'Choose a date.';
    if (mode === 'bulk' && !dates.size) return 'Choose at least one date.';
    if (!time) return 'Choose a start time.';
    const first = mode === 'single' ? date! : sortedDates[0];
    if (zonedToUtc(first, time, team.timezone) <= new Date()) return 'That time has already passed. Choose a later time.';
    return null;
  };
  const next = (to: Step) => {
    const e = to === 'roster' ? detailsError() : null;
    setError(e);
    if (!e) setStep(to);
  };

  const create = () =>
    run(async () => {
      const e = detailsError();
      if (e) return setError(e);
      const fields = eventFormParams(form, team);
      const endsAt = mode === 'single' ? endInstant(date!, time!, endTime, team.timezone) : null;
      const results =
        mode === 'single'
          ? [
              await api<CreateResult>('createEvent', {
                teamId,
                ...fields,
                startsAt: zonedToUtc(date!, time!, team.timezone).toISOString(),
                endsAt: endsAt?.toISOString() ?? null,
                notifyPlayers: notify,
              }),
            ]
          : await api<CreateResult[]>('createEvents', { teamId, ...fields, time, endTime, dates: sortedDates, notifyPlayers: notify });
      if (!useDefaultRoster) {
        const requirements = Object.entries(custom)
          .filter(([, q]) => q > 0)
          .map(([positionId, quantity]) => ({ positionId, quantity }));
        for (const r of results) await api('setEventRequirements', { eventId: r.eventId, requirements, callupSpots: customCallupSpots });
      }
      setCreated(results);
      const pending = results.filter((r) => r.releaseDecisionRequired);
      if (pending.length) setNeedDecision(pending);
      else setStep('done');
    });

  const decide = (send: boolean) =>
    run(async () => {
      for (const r of needDecision) await api(send ? 'sendAttendanceNow' : 'holdAttendance', { eventId: r.eventId });
      setNeedDecision([]);
      setStep('done');
    });

  const restart = () => {
    setForm(emptyEventForm());
    setDate(null);
    setDates(new Set());
    setTime(null);
    setEndTime(null);
    setUseDefaultRoster(true);
    setCreated([]);
    setStep('type');
  };

  const toggleDate = (d: string) => {
    const nextDates = new Set(dates);
    if (nextDates.has(d)) nextDates.delete(d);
    else nextDates.add(d);
    setDates(nextDates);
  };

  const footer: Record<Step, ReactNode> = {
    type: null,
    details: <Button label="Next" onPress={() => next('roster')} />,
    roster: <Button label="Next" onPress={() => next('review')} />,
    review: (
      <ButtonRow>
        <Button label="Back" variant="secondary" onPress={() => setStep('roster')} style={{ flex: 1 }} />
        <Button label={created.length ? 'Created' : sortedDates.length > 1 && mode === 'bulk' ? `Create ${sortedDates.length} Events` : 'Create Event'} busy={busy} disabled={!!created.length} onPress={() => void create()} style={{ flex: 2 }} />
      </ButtonRow>
    ),
    done: null,
  };

  const whenText = mode === 'single' ? (date ? shortDate(date) : '') : sortedDates.map((d) => shortDate(d, false)).join(', ');
  const title = matchTitle({ type: form.type, name: form.name.trim() || null, opponent: form.opponent.trim() || null }, team.name);

  return (
    <TeamAccent color={team.accent_color}>
      <Screen footer={footer[step]}>
        <Stack.Screen
          options={{
            title: TITLES[step],
            headerLeft: PREVIOUS[step] ? () => <HeaderBack onPress={() => setStep(PREVIOUS[step]!)} /> : undefined,
          }}
        />

        {step === 'type' && (
          <>
            <Text style={font.heading}>Select Event Type</Text>
            <Card flush>
              {EVENT_TYPE_SELECT.map((o, i) => (
                <ListRow
                  key={o.value}
                  first={i === 0}
                  title={o.label}
                  leading={<EventTypeIcon type={o.value as EventType} size={40} />}
                  strong
                  onPress={() => {
                    setForm({ ...form, type: o.value as EventType });
                    setStep('details');
                  }}
                />
              ))}
            </Card>
          </>
        )}

        {step === 'details' && (
          <>
            <Text style={font.heading}>Event Details</Text>
            <EventForm value={form} onChange={setForm} team={team}>
              <Segmented
                options={[
                  { value: 'single', label: 'One Date' },
                  { value: 'bulk', label: 'Several Dates' },
                ]}
                value={mode}
                onChange={setMode}
              />
              <FieldButton
                label={mode === 'single' ? 'Date' : 'Dates'}
                required
                icon="calendar-outline"
                value={mode === 'single' ? (date ? shortDate(date) : null) : dates.size ? `${dates.size} ${dates.size === 1 ? 'date' : 'dates'} selected` : null}
                placeholder="Choose a date"
                active={pickingDate}
                onPress={() => setPickingDate(!pickingDate)}
              />
              {(pickingDate || mode === 'bulk') && (
                <Card>
                  {mode === 'bulk' && <Text style={font.small}>Tap each date to add the same Event on all of them.</Text>}
                  <MonthCalendar
                    initialDate={date ?? today}
                    selected={mode === 'single' ? date : dates}
                    isDisabled={(d) => d < today}
                    onSelect={(d) => {
                      if (mode === 'single') {
                        setDate(d);
                        setPickingDate(false);
                      } else toggleDate(d);
                    }}
                  />
                </Card>
              )}
              <TimeField label="Start Time" required value={time} onChange={setTime} hint={`In the Team's time zone (${team.timezone}).`} />
              <TimeField label="End Time (optional)" value={endTime} onChange={setEndTime} />
              {endTime ? <Button label="Clear End Time" variant="ghost" size="sm" onPress={() => setEndTime(null)} style={{ alignSelf: 'flex-start' }} /> : null}
            </EventForm>
            <ErrorText error={error} />
          </>
        )}

        {step === 'roster' && (
          <>
            {managed.length > 1 ? (
              <Select label="Select Team" title="Select Team" options={managed.map((m) => ({ value: m.team.id, label: m.team.name }))} value={teamId} onChange={setTeamId} />
            ) : (
              <View>
                <Text style={font.label}>Team</Text>
                <Text style={font.heading}>{team.name}</Text>
              </View>
            )}
            <Card>
              <ToggleRow
                label="Apply Default Roster"
                hint="Use the Team's default Position requirements and callup settings."
                value={useDefaultRoster}
                onChange={setUseDefaultRoster}
              />
              <Button label="View Default Settings" variant="secondary" size="sm" onPress={() => setShowDefaults(true)} />
            </Card>
            <Card>
              <ToggleRow label="Or Use Custom Roster Settings" hint="For this Event only." value={!useDefaultRoster} onChange={(v) => setUseDefaultRoster(!v)} />
              {!useDefaultRoster &&
                editable.map((p) => <StepperRow key={p.id} label={p.name} value={custom[p.id] ?? 0} onChange={(v) => setCustom({ ...custom, [p.id]: v })} />)}
              {!useDefaultRoster && <StepperRow label="Callup spots" value={customCallupSpots} max={20} onChange={setCustomCallupSpots} />}
            </Card>
            <DefaultsSheet visible={showDefaults} onClose={() => setShowDefaults(false)} detail={detail ?? null} team={team} />
          </>
        )}

        {step === 'review' && (
          <>
            <Card>
              <Text style={styles.reviewTitle}>{title}</Text>
              <View style={styles.typeRow}>
                <EventTypeIcon type={form.type} size={26} />
                <Text style={font.body}>{EVENT_TYPE_STYLE[form.type].label}</Text>
              </View>
              <DetailLine icon="calendar-outline">{whenText}</DetailLine>
              <DetailLine icon="time-outline">{time ? `${clock(time)}${endTime ? ` – ${clock(endTime)}` : ''}` : ''}</DetailLine>
              {eventFormParams(form, team).location ? <DetailLine icon="location-outline">{eventFormParams(form, team).location}</DetailLine> : null}
              <View style={styles.notes}>
                <Text style={font.label}>Notes</Text>
                <Text style={font.body}>{form.notes.trim() || '—'}</Text>
              </View>
            </Card>
            <Card>
              <Text style={font.heading}>Roster Settings</Text>
              <DetailLine icon={useDefaultRoster ? 'checkmark-circle' : 'options'}>{useDefaultRoster ? 'Use Default Settings' : 'Custom settings for this Event'}</DetailLine>
            </Card>
            <Card>
              <Text style={font.heading}>Notifications</Text>
              <CheckRow first title="Notify players after creation" checked={notify} onPress={() => setNotifyPlayers(!notify)} />
              <Notice tone="primary">Players get a "New Event" notification. The attendance request follows your Team's attendance settings.</Notice>
            </Card>
            <Notice tone="primary" title="Attendance">
              {team.attendance_mode === 'AUTOMATIC'
                ? `Players are asked ${team.release_days_before === 0 ? 'on the day' : `${team.release_days_before} ${team.release_days_before === 1 ? 'day' : 'days'} before`} at ${clock(team.release_time)}, based on your Team's attendance settings. You can send it sooner from the Event.`
                : "Your Team sends attendance manually: you'll be reminded when it's time to send."}
            </Notice>
            <ErrorText error={error} />
          </>
        )}

        {step === 'done' && (
          <>
            <SuccessState
              title={created.length > 1 ? `${created.length} Events Created!` : 'Event Created Successfully!'}
              body={created.length > 1 ? `${title} has been added to ${created.length} dates.` : `${title} has been created.`}
            />
            {created.length === 1 && <Button label="View Event" onPress={() => router.replace({ pathname: '/event/[id]', params: { id: created[0].eventId } })} />}
            <Button label="Add to Calendar" icon="calendar-outline" variant="secondary" onPress={() => router.push('/profile')} />
            <Button label="View Team Schedule" variant="secondary" onPress={() => router.replace('/schedule')} />
            <Button label="Create Another Event" variant="secondary" onPress={restart} />
          </>
        )}

        <ReleaseDecisionSheet count={needDecision.length} visible={needDecision.length > 0} busy={busy} onSendNow={() => void decide(true)} onHoldOff={() => void decide(false)} />
      </Screen>
    </TeamAccent>
  );
}

/** "Roster Settings Summary" (wireframe 5): what the Team defaults would apply. */
function DefaultsSheet({ visible, onClose, detail, team }: { visible: boolean; onClose: () => void; detail: TeamDetail | null; team: Team }) {
  const positions = detail ? sortPositions(detail.positions) : [];
  const required = detail?.requirements.filter((r) => r.quantity > 0) ?? [];
  const value = (text: string) => <Text style={font.body}>{text}</Text>;
  return (
    <Sheet visible={visible} onClose={onClose} title={`${team.name} – Default Settings`}>
      <View>
        {required.length ? (
          required.map((r, i) => <ListRow key={r.positionId} first={i === 0} title={positions.find((p) => p.id === r.positionId)?.name ?? 'Position'} right={value(String(r.quantity))} />)
        ) : (
          <ListRow first title="Positions" right={value('No limits')} />
        )}
        <ListRow title="Include Callups" right={value(team.include_callups ? 'Enabled' : 'Disabled')} />
        <ListRow title="Callup Spots" right={value(team.include_callups && team.callup_spots ? String(team.callup_spots) : 'As needed')} />
        <ListRow title="Callup Mode" right={value(team.callup_selection_method === 'RANDOMIZED_ROTATION' ? 'Randomized' : 'Listed Order')} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  reviewTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  notes: { gap: 2, paddingTop: space.xs },
});
