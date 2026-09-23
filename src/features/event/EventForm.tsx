// Event fields shared by create and edit (spec §12, §13).
import { useState } from 'react';
import { Text, View } from 'react-native';
import type { EventType } from '../../domain/index.ts';
import type { Team } from '../../lib/data';
import { Button, ButtonRow, Chips, Field, Segmented, Sheet } from '../../ui/components';
import { EVENT_TYPE_OPTIONS } from '../../ui/format';
import { font, space } from '../../ui/theme';

export interface EventFormValue {
  type: EventType;
  name: string;
  opponent: string;
  /** null means the Team default location. */
  customLocation: string | null;
  notes: string;
}

export const teamDefaultLocation = (team: Team) => team.default_location ?? team.arena ?? null;

export function emptyEventForm(): EventFormValue {
  return { type: 'GAME', name: '', opponent: '', customLocation: null, notes: '' };
}

export function eventFormParams(v: EventFormValue, team: Team) {
  return {
    type: v.type,
    name: v.name.trim() || null,
    opponent: v.type === 'GAME' || v.type === 'TOURNAMENT' ? v.opponent.trim() || null : null,
    location: v.customLocation !== null ? v.customLocation.trim() || null : teamDefaultLocation(team),
    notes: v.notes.trim() || null,
  };
}

export function eventFormError(v: EventFormValue): string | null {
  if (v.type === 'CUSTOM' && !v.name.trim()) return 'Enter a name for the Custom Event.';
  return null;
}

export function EventForm({ value, onChange, team }: { value: EventFormValue; onChange: (v: EventFormValue) => void; team: Team }) {
  const set = (patch: Partial<EventFormValue>) => onChange({ ...value, ...patch });
  const defaultLocation = teamDefaultLocation(team);
  const hasOpponent = value.type === 'GAME' || value.type === 'TOURNAMENT';
  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: space.sm }}>
        <Text style={font.label}>Event type</Text>
        <Chips options={EVENT_TYPE_OPTIONS} value={value.type} onChange={(type) => set({ type })} />
      </View>
      <Field
        label={value.type === 'CUSTOM' ? 'Event name' : 'Event name (optional)'}
        value={value.name}
        onChangeText={(name) => set({ name })}
        maxLength={80}
        placeholder={value.type === 'TOURNAMENT' ? 'Spring Classic' : value.type === 'CUSTOM' ? 'Team photo day' : ''}
      />
      {hasOpponent && <Field label="Opponent" value={value.opponent} onChangeText={(opponent) => set({ opponent })} maxLength={80} />}
      <View style={{ gap: space.sm }}>
        <Text style={font.label}>Location</Text>
        <Segmented
          options={[
            { value: 'default', label: 'Team Default' },
            { value: 'custom', label: 'Custom Location' },
          ]}
          value={value.customLocation === null ? 'default' : 'custom'}
          onChange={(v) => set({ customLocation: v === 'default' ? null : '' })}
        />
        {value.customLocation === null ? (
          <Text style={font.small}>{defaultLocation ?? 'No default location set in Team Settings.'}</Text>
        ) : (
          <Field label="Custom location" value={value.customLocation} onChangeText={(customLocation) => set({ customLocation })} maxLength={200} />
        )}
      </View>
      <Field label="Notes (optional)" value={value.notes} onChangeText={(notes) => set({ notes })} maxLength={1000} multiline />
    </View>
  );
}

/**
 * Asked when the normal release time has already passed (spec §29): SEND NOW or HOLD OFF, never a
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
    <Sheet visible={visible} onClose={onHoldOff} title="Send attendance now?">
      <Text style={font.body}>
        {count === 1
          ? "The normal attendance time for this Event has already passed. Nothing has been sent."
          : `The normal attendance time has already passed for ${count} of these Events. Nothing has been sent.`}
      </Text>
      <ButtonRow>
        <Button
          label="Hold Off"
          variant="secondary"
          busy={busy && pressed === 'hold'}
          onPress={() => {
            setPressed('hold');
            onHoldOff();
          }}
          style={{ flex: 1 }}
        />
        <Button
          label="Send Now"
          busy={busy && pressed === 'send'}
          onPress={() => {
            setPressed('send');
            onSendNow();
          }}
          style={{ flex: 1 }}
        />
      </ButtonRow>
    </Sheet>
  );
}
