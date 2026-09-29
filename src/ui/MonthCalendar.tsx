// Month grid used by the Schedule calendar, Schedule Attendance, Mark Unavailable and Event creation.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { addDays, localDate } from '../domain/index.ts';
import { useAccent } from './accent';
import { deviceTimeZone } from './format';
import { colors, radius, space } from './theme';

export interface DayMark {
  /** Something is scheduled that day. */
  dot?: boolean;
  /** Dot colours, one per Event, when dots should show the Event type. */
  dots?: string[];
  /** The signed-in player marked the day unavailable. */
  unavailable?: boolean;
  /** Emphasised day, such as the Event date in Schedule Attendance. */
  highlight?: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function MonthCalendar({
  initialDate,
  selected,
  marks = {},
  isDisabled,
  onSelect,
  today,
}: {
  /** YYYY-MM-DD shown first. */
  initialDate: string;
  selected: ReadonlySet<string> | string | null;
  marks?: Record<string, DayMark>;
  isDisabled?: (date: string) => boolean;
  onSelect: (date: string) => void;
  /** YYYY-MM-DD to mark as today; defaults to the device's date. */
  today?: string;
}) {
  const a = useAccent();
  const todayKey = today ?? localDate(new Date(), deviceTimeZone());
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const startWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array<null>(startWeekday).fill(null)];
  for (let i = 0; i < daysInMonth; i++) cells.push(addDays(first, i));
  while (cells.length % 7) cells.push(null);
  const isSelected = (d: string) => (typeof selected === 'string' ? selected === d : !!selected?.has(d));

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={10} onPress={() => setMonth(shiftMonth(month, -1))}>
          <Ionicons name="chevron-back" size={22} color={a.ink} />
        </Pressable>
        <Text style={styles.monthTitle}>
          {MONTHS[m - 1]} {y}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" hitSlop={10} onPress={() => setMonth(shiftMonth(month, 1))}>
          <Ionicons name="chevron-forward" size={22} color={a.ink} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} style={styles.row}>
          {cells.slice(row * 7, row * 7 + 7).map((date, i) => {
            if (!date) return <View key={i} style={styles.cell} />;
            const disabled = isDisabled?.(date) ?? false;
            const mark = marks[date];
            const sel = isSelected(date);
            const dots = mark?.dots ?? (mark?.dot ? [a.accent] : []);
            const isToday = date === todayKey;
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityLabel={`${date}${mark?.unavailable ? ', unavailable' : ''}${dots.length ? ', has events' : ''}`}
                accessibilityState={{ disabled, selected: sel }}
                disabled={disabled}
                onPress={() => onSelect(date)}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.day,
                    disabled && styles.dayDisabled,
                    mark?.unavailable && styles.dayUnavailable,
                    mark?.highlight && { backgroundColor: a.soft, borderColor: a.accent },
                    isToday && !sel && { borderColor: a.accent },
                    sel && { backgroundColor: a.accent, borderColor: a.accent },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isToday && { fontWeight: '700', color: a.ink },
                      disabled && styles.dayTextDisabled,
                      mark?.unavailable && styles.dayTextUnavailable,
                      sel && { color: a.onAccent, fontWeight: '700', textDecorationLine: 'none' },
                    ]}
                  >
                    {Number(date.slice(8))}
                  </Text>
                  <View style={styles.dots}>
                    {dots.slice(0, 3).map((c, k) => (
                      <View key={k} style={[styles.dot, { backgroundColor: sel ? a.onAccent : c }]} />
                    ))}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** The key under a calendar: a coloured dot (or square) and what it means. */
export function CalendarLegend({ items }: { items: { color: string; label: string; square?: boolean; outline?: boolean }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((it) => (
        <View key={it.label} style={styles.legendItem}>
          <View
            style={[
              it.square ? styles.legendSquare : styles.legendDot,
              { backgroundColor: it.outline ? 'transparent' : it.color, borderColor: it.color, borderWidth: it.outline ? 1.5 : 0 },
            ]}
          />
          <Text style={styles.legendText}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: space.sm },
  monthTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: colors.textMuted, paddingBottom: space.xs },
  cell: { flex: 1, alignItems: 'center', padding: 2 },
  day: {
    width: '100%',
    maxWidth: 46,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  dayDisabled: { backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted },
  dayUnavailable: { backgroundColor: colors.unavailable, borderColor: colors.unavailable },
  dayText: { fontSize: 14, color: colors.text },
  dayTextDisabled: { color: colors.disabled },
  dayTextUnavailable: { color: colors.textMuted, textDecorationLine: 'line-through' },
  dots: { flexDirection: 'row', gap: 2, height: 5, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendSquare: { width: 14, height: 14, borderRadius: 3 },
  legendText: { fontSize: 13, color: colors.textMuted },
});
