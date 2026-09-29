// Event fields shared by create and edit (spec §12, §13; wireframe 5B "Enter Event Details").
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { addDays, zonedToUtc, type EventType } from '../../domain/index.ts';
import type { Team } from '../../lib/data';
import { Button, Dialog, Field, FieldLabel, Segmented, Select } from '../../ui/components';
import { EVENT_TYPE_STYLE, EventTypeIcon } from '../../ui/EventTypeIcon';
import { EVENT_TYPE_OPTIONS } from '../../ui/format';
import { font, space } from '../../ui/theme';

export interface EventFormValue {
  type: EventType;
  name: string;
  opponent: string;
  /** null means the Team default location. */
  customLocation: string | null;
  notes: string;
  homeAway: 'HOME' | 'AWAY' | null;
}

export const NAME_MAX = 80;
export const NOTES_MAX = 1000;

export const teamDefaultLocation = (team: Team) => team.default_location ?? team.arena ?? null;

export function emptyEventForm(type: EventType = 'GAME'): EventFormValue {
  return { type, name: '', opponent: '', customLocation: null, notes: '', homeAway: null };
}

export const hasOpponent = (type: EventType) => type === 'GAME' || type === 'TOURNAMENT';

export function eventFormParams(v: EventFormValue, team: Team) {
  return {
    type: v.type,
    name: v.name.trim() || null,
    opponent: hasOpponent(v.type) ? v.opponent.trim() || null : null,
    location: v.customLocation !== null ? v.customLocation.trim() || null : teamDefaultLocation(team),
    notes: v.notes.trim() || null,
    homeAway: hasOpponent(v.type) ? v.homeAway : null,
  };
}

/** The end instant for an optional HH:MM end time on the start date, past midnight if it's earlier. */
export function endInstant(date: string, start: string, end: string | null, timezone: string): Date | null {
  if (!end) return null;
  return zonedToUtc(end > start ? date : addDays(date, 1), end, timezone);
}

export function eventFormError(v: EventFormValue): string | null {
  if (v.type === 'CUSTOM' && !v.name.trim()) return 'Enter a name for the Custom Event.';
  return null;
}

export const EVENT_TYPE_SELECT = EVENT_TYPE_OPTIONS.map((o) => ({
  value: o.value,
  label: EVENT_TYPE_STYLE[o.value].label,
  icon: <EventTypeIcon type={o.value} size={26} />,
}));

/** Type, name, opponent, location and notes. Date and time are laid out by the screen. */
export function EventForm({ value, onChange, team, children }: { value: EventFormValue; onChange: (v: EventFormValue) => void; team: Team; children?: ReactNode }) {
  const set = (patch: Partial<EventFormValue>) => onChange({ ...value, ...patch });
  const defaultLocation = teamDefaultLocation(team);
  const location = value.customLocation ?? defaultLocation ?? '';
  return (
    <View style={{ gap: space.lg }}>
      <Select label="Event Type" title="Event Type" options={EVENT_TYPE_SELECT} value={value.type} onChange={(type) => set({ type })} />
      <Field
        label="Event Name"
        required={value.type === 'CUSTOM'}
        value={value.name}
        onChangeText={(name) => set({ name })}
        maxLength={NAME_MAX}
        showCount
        placeholder={value.type === 'TOURNAMENT' ? 'Spring Classic' : value.type === 'CUSTOM' ? 'Team BBQ' : 'Optional'}
      />
      {hasOpponent(value.type) && <Field label="Opponent" value={value.opponent} onChangeText={(opponent) => set({ opponent })} maxLength={80} placeholder="Bulldogs" />}
      {hasOpponent(value.type) && (
        <View style={{ gap: 6 }}>
          <FieldLabel label="Home or Away" />
          <Segmented
            options={[
              { value: 'HOME', label: 'Home' },
              { value: 'AWAY', label: 'Away' },
              { value: 'NONE', label: 'Not set' },
            ]}
            value={value.homeAway ?? 'NONE'}
            onChange={(v) => set({ homeAway: v === 'NONE' ? null : v })}
          />
        </View>
      )}
      {children}
      <Field
        label="Location"
        value={location}
        onChangeText={(text) => set({ customLocation: text === defaultLocation ? null : text })}
        maxLength={200}
        icon="location-outline"
        placeholder="Arena or address"
        hint={value.customLocation === null && defaultLocation ? 'Team default location' : undefined}
      />
      <Field
        label="Notes (optional)"
        value={value.notes}
        onChangeText={(notes) => set({ notes })}
        maxLength={NOTES_MAX}
        showCount
        multiline
        placeholder="Add any additional details... One per line shows as a list."
      />
    </View>
  );
}

/**
 * Asked when the normal release time has already passed (spec §29): Send Now or Hold Off, never a
 * silent send.
 */
export function ReleaseDecisionSheet({
  count,
  visible,
  busy,
  onSendNow,
  onHoldOff,
}: {
  count: number;
  visible: boolean;
  busy: boolean;
  onSendNow: () => void;
  onHoldOff: () => void;
}) {
  const [pressed, setPressed] = useState<'send' | 'hold' | null>(null);
  return (
    <Dialog
      visible={visible}
      onClose={onHoldOff}
      title="Send attendance now?"
      body={
        count === 1
          ? 'The normal attendance time for this Event has already passed. Nothing has been sent.'
          : `The normal attendance time has already passed for ${count} of these Events. Nothing has been sent.`
      }
    >
      <View style={{ gap: space.sm }}>
        <Button
          label="Send Now"
          busy={busy && pressed === 'send'}
          onPress={() => {
            setPressed('send');
            onSendNow();
          }}
        />
        <Button
          label="Hold Off"
          variant="secondary"
          busy={busy && pressed === 'hold'}
          onPress={() => {
            setPressed('hold');
            onHoldOff();
          }}
        />
        <Text style={[font.small, { textAlign: 'center' }]}>Hold Off keeps it unsent; send it from the Event whenever you're ready.</Text>
      </View>
    </Dialog>
  );
}
