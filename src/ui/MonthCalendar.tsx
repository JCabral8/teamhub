// Month grid used by the Schedule calendar, SCHEDULE LATER and bulk Event creation.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { addDays, localDate } from '../domain/index.ts';
import { deviceTimeZone } from './format';
import { colors, font, radius, space } from './theme';

export interface DayMark {
  /** Something is scheduled that day. */
  dot?: boolean;
  /** The signed-in player marked the day unavailable. */
  unavailable?: boolean;
  /** Emphasised day, such as the Event date in SCHEDULE LATER. */
  highlight?: boolean;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

function monthKey(date: string) {
  return date.slice(0, 7);
}

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
  const todayKey = today ?? localDate(new Date(), deviceTimeZone());
  const [month, setMonth] = useState(monthKey(initialDate));
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
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Text style={font.heading}>
          {MONTHS[m - 1]} {y}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" hitSlop={10} onPress={() => setMonth(shiftMonth(month, 1))}>
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.weekday}>
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
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityLabel={`${date}${mark?.unavailable ? ', unavailable' : ''}${mark?.dot ? ', has events' : ''}`}
                accessibilityState={{ disabled, selected: sel }}
                disabled={disabled}
                onPress={() => onSelect(date)}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.day,
                    mark?.highlight && styles.dayHighlight,
                    mark?.unavailable && styles.dayUnavailable,
                    sel && styles.daySelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      date === todayKey && styles.dayTextToday,
                      disabled && styles.dayTextDisabled,
                      mark?.unavailable && styles.dayTextUnavailable,
                      sel && styles.dayTextSelected,
                    ]}
                  >
                    {Number(date.slice(8))}
                  </Text>
                </View>
                <View style={[styles.dot, { backgroundColor: mark?.dot ? colors.primary : 'transparent' }]} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: space.sm },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: colors.textFaint },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  day: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  dayHighlight: { borderWidth: 2, borderColor: colors.primary },
  dayUnavailable: { backgroundColor: colors.negativeSoft },
  daySelected: { backgroundColor: colors.primary },
  dayText: { fontSize: 15, color: colors.text },
  dayTextToday: { color: colors.primary, fontWeight: '700' },
  dayTextDisabled: { color: colors.disabled },
  dayTextUnavailable: { color: colors.negative, textDecorationLine: 'line-through' },
  dayTextSelected: { color: colors.primaryText, fontWeight: '700', textDecorationLine: 'none' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
});
