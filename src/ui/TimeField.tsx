// Time entry without typing: tap the field, then pick the hour and the minutes on a clock face.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useAccent } from './accent';
import { Button, ButtonRow, Segmented, Sheet } from './components';
import { clock } from './format';
import { colors, font, radius, space } from './theme';

const DIAL = 260;
const LABEL = 40;
const RING = DIAL / 2 - LABEL / 2 - 6;
const DEFAULT_TIME = '19:00';
// Stops the page from scrolling while a finger drags the hand in a mobile browser.
const noScroll = (Platform.OS === 'web' ? { touchAction: 'none', cursor: 'pointer' } : {}) as ViewStyle;

type Mode = 'hour' | 'minute';
const pad = (n: number) => String(n).padStart(2, '0');

/** A time field that opens a clock. Reports HH:MM (24-hour), like the rest of the app. */
export function TimeField({ label, value, onChange, hint }: { label: string; value: string | null; onChange: (time: string | null) => void; hint?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? clock(value) : 'not set'}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.input, pressed && { opacity: 0.7 }]}
      >
        <Text style={[styles.inputText, !value && { color: colors.textFaint }]}>{value ? clock(value) : 'Choose a time'}</Text>
        <Ionicons name="time-outline" size={20} color={colors.textMuted} />
      </Pressable>
      {hint ? <Text style={font.small}>{hint}</Text> : null}
      {open && (
        <ClockSheet
          title={label}
          initial={value ?? DEFAULT_TIME}
          onClose={() => setOpen(false)}
          onSet={(t) => {
            onChange(t);
            setOpen(false);
          }}
        />
      )}
    </View>
  );
}

function ClockSheet({ title, initial, onClose, onSet }: { title: string; initial: string; onClose: () => void; onSet: (time: string) => void }) {
  const a = useAccent();
  const [h24, m0] = initial.split(':').map(Number);
  const [hour, setHour] = useState(h24 % 12 === 0 ? 12 : h24 % 12);
  const [minute, setMinute] = useState(m0);
  const [pm, setPm] = useState(h24 >= 12);
  const [mode, setMode] = useState<Mode>('hour');

  const result = `${pad((hour % 12) + (pm ? 12 : 0))}:${pad(minute)}`;
  const values = mode === 'hour' ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  const selected = mode === 'hour' ? hour : minute;
  const handAngle = mode === 'hour' ? (hour % 12) * 30 : minute * 6;

  // Tap or drag on the dial: the value nearest the finger is picked; letting go of an hour moves on to minutes.
  const state = useRef({ mode, start: { x: 0, y: 0 } });
  state.current.mode = mode;
  const pickAt = (x: number, y: number) => {
    const angle = ((Math.atan2(x - DIAL / 2, DIAL / 2 - y) * 180) / Math.PI + 360) % 360;
    const index = Math.round(angle / 30) % 12;
    if (state.current.mode === 'hour') setHour(index === 0 ? 12 : index);
    else setMinute(index * 5);
  };
  const dial = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        state.current.start = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        pickAt(state.current.start.x, state.current.start.y);
      },
      onPanResponderMove: (_e, g) => pickAt(state.current.start.x + g.dx, state.current.start.y + g.dy),
      onPanResponderRelease: () => {
        if (state.current.mode === 'hour') setMode('minute');
      },
    }),
  ).current.panHandlers;

  const segment = (m: Mode, text: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={m === 'hour' ? 'Hour' : 'Minutes'} onPress={() => setMode(m)}>
      <Text style={[styles.readout, { color: mode === m ? a.ink : colors.textFaint }]}>{text}</Text>
    </Pressable>
  );

  return (
    <Sheet visible onClose={onClose} title={title}>
      <View style={styles.readoutRow}>
        {segment('hour', String(hour))}
        <Text style={[styles.readout, { color: colors.textFaint }]}>:</Text>
        {segment('minute', pad(minute))}
      </View>
      <View style={{ alignSelf: 'center', width: 160 }}>
        <Segmented
          options={[
            { value: 'AM', label: 'AM' },
            { value: 'PM', label: 'PM' },
          ]}
          value={pm ? 'PM' : 'AM'}
          onChange={(v) => setPm(v === 'PM')}
        />
      </View>
      <Text style={[font.small, { textAlign: 'center' }]}>{mode === 'hour' ? 'Pick the hour' : 'Pick the minutes'}</Text>

      <View {...dial} accessibilityLabel={mode === 'hour' ? 'Hour dial' : 'Minute dial'} style={[styles.dial, noScroll]}>
        {/* The hand: a full-size layer turned about the dial's centre, with a line from the centre up. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${handAngle}deg` }] }]}>
          <View style={[styles.hand, { backgroundColor: a.accent }]} />
        </View>
        <View pointerEvents="none" style={[styles.pivot, { backgroundColor: a.accent }]} />
        {values.map((v, i) => {
          const rad = (i * 30 * Math.PI) / 180;
          const on = v === selected;
          return (
            <View
              key={v}
              pointerEvents="none"
              style={[
                styles.number,
                { left: DIAL / 2 + RING * Math.sin(rad) - LABEL / 2, top: DIAL / 2 - RING * Math.cos(rad) - LABEL / 2 },
                on && { backgroundColor: a.accent },
              ]}
            >
              <Text style={[styles.numberText, on && { color: a.onAccent, fontWeight: '700' }]}>{mode === 'minute' ? pad(v) : v}</Text>
            </View>
          );
        })}
      </View>

      <ButtonRow>
        <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button label={`Set ${clock(result)}`} onPress={() => onSet(result)} style={{ flex: 1 }} />
      </ButtonRow>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputText: { fontSize: 16, color: colors.text },
  readoutRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.xs },
  readout: { fontSize: 44, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dial: { width: DIAL, height: DIAL, borderRadius: DIAL / 2, backgroundColor: colors.surfaceMuted, alignSelf: 'center' },
  hand: { position: 'absolute', left: DIAL / 2 - 1, top: DIAL / 2 - RING, width: 2, height: RING },
  pivot: { position: 'absolute', left: DIAL / 2 - 4, top: DIAL / 2 - 4, width: 8, height: 8, borderRadius: 4 },
  number: { position: 'absolute', width: LABEL, height: LABEL, borderRadius: LABEL / 2, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 16, color: colors.text },
});
