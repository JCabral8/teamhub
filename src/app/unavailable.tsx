import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { localDate } from '../domain/index.ts';
import { markUnavailableRange } from '../lib/data';
import { useAction } from '../lib/hooks';
import { Button, Card, ErrorText, FieldButton, Notice, Screen } from '../ui/components';
import { deviceTimeZone, shortDate } from '../ui/format';
import { MonthCalendar } from '../ui/MonthCalendar';
import { font } from '../ui/theme';

/** Wireframe 4a "Mark Unavailable": a date range that applies to every Team. */
export default function MarkUnavailable() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const today = localDate(new Date(), deviceTimeZone());
  const [start, setStart] = useState(params.date && params.date >= today ? params.date : today);
  const [end, setEnd] = useState<string | null>(null);
  const [editing, setEditing] = useState<'start' | 'end' | null>(null);
  const { busy, error, setError, run } = useAction();

  const pick = (d: string) => {
    if (editing === 'start') {
      setStart(d);
      if (end && end < d) setEnd(null);
    } else setEnd(d);
    setEditing(null);
  };

  const save = () =>
    run(async () => {
      if (end && end < start) return setError('The end date must be on or after the start date.');
      await markUnavailableRange(start, end ?? start);
      router.back();
    });

  return (
    <Screen footer={<Button label="Save" busy={busy} onPress={() => void save()} />}>
      <Card>
        <Text style={font.heading}>Date Range</Text>
        <FieldButton label="Start Date" icon="calendar-outline" value={shortDate(start)} active={editing === 'start'} onPress={() => setEditing(editing === 'start' ? null : 'start')} />
        <FieldButton label="End Date (optional)" icon="calendar-outline" value={end ? shortDate(end) : null} placeholder="Same day" active={editing === 'end'} onPress={() => setEditing(editing === 'end' ? null : 'end')} />
        {editing && (
          <MonthCalendar
            initialDate={editing === 'end' ? (end ?? start) : start}
            selected={editing === 'end' ? end : start}
            isDisabled={(d) => d < (editing === 'end' ? start : today)}
            onSelect={pick}
          />
        )}
      </Card>
      <Notice tone="primary">Applies to all your Teams. Attendance for Events on these dates is recorded as No when it is sent, and you can still change it to Yes.</Notice>
      <ErrorText error={error} />
    </Screen>
  );
}
