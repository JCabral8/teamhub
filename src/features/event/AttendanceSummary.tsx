// Manager attendance summary (wireframes 3A, 4 "Roster with Pending", 9): "12 / 13", how far off the
// default it is, a bar, and Position coverage (spec §33, §34).
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import type { RosterStatus } from '../../domain/index.ts';
import { Badge, Card, ProgressBar } from '../../ui/components';
import { colors, font, space } from '../../ui/theme';

export function AttendanceSummary({ status, released }: { status: RosterStatus; released: boolean }) {
  const { counts, coverage, openSpots } = status;
  const attending = counts.goalies + counts.players;
  const capacity = openSpots === null ? null : coverage.reduce((s, c) => s + c.required, 0) || attending + openSpots;
  const below = capacity !== null ? Math.max(0, capacity - attending) : 0;

  return (
    <Card>
      <Text style={font.heading}>Attendance Summary</Text>
      <View style={styles.bigRow}>
        <Text style={styles.big}>{capacity !== null ? `${attending} / ${capacity}` : `${attending}`}</Text>
        {capacity === null ? (
          <Text style={font.small}>attending · no roster limit</Text>
        ) : below === 0 ? (
          <Badge label="Full" tone="positive" />
        ) : released ? (
          <Badge label={`${below} Below Default`} tone="negative" />
        ) : (
          <Badge label={`${below} spots open`} tone="neutral" />
        )}
      </View>
      {capacity !== null && <ProgressBar value={attending} max={capacity} tone={below === 0 ? 'positive' : released ? 'negative' : 'neutral'} />}
      {coverage.length > 0 && (
        <View style={{ gap: space.xs }}>
          <Text style={[font.body, { fontWeight: '700' }]}>Coverage</Text>
          {coverage.map((c) => (
            <View key={c.positionId} style={styles.line}>
              <Text style={[font.body, { flex: 1 }]}>{c.name}</Text>
              <Text style={[font.body, { fontWeight: '600' }]}>
                {c.attending} / {c.required}
              </Text>
              <Ionicons
                name={c.short ? 'alert-circle' : 'checkmark'}
                size={18}
                color={!c.short ? colors.positive : released ? colors.negative : colors.textFaint}
                accessibilityLabel={c.short ? 'Short' : 'Covered'}
              />
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  bigRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  big: { fontSize: 30, fontWeight: '800', color: colors.text },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
