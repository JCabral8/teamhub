// Attendance settings (spec §25, §26, §54).
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { Button, Card, ErrorText, Notice, Segmented, Stepper } from '../../ui/components';
import { clock } from '../../ui/format';
import { TimeField } from '../../ui/TimeField';
import { font } from '../../ui/theme';
import type { SectionProps } from './types';

export function AttendanceSettings({ membership, reload }: SectionProps) {
  const team = membership.team;
  const [mode, setMode] = useState(team.attendance_mode);
  const [days, setDays] = useState(team.release_days_before);
  const [time, setTime] = useState<string | null>(team.release_time);
  const [saved, setSaved] = useState(false);
  const { busy, error, setError, run } = useAction();

  const save = () =>
    run(async () => {
      setSaved(false);
      if (!time) return setError('Enter a release time.');
      await api('updateTeamSettings', {
        teamId: team.id,
        attendanceMode: mode,
        releaseDaysBefore: days,
        releaseTime: time,
      });
      await reload();
      setSaved(true);
    });

  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const };
  return (
    <>
      <Card>
        <Text style={font.heading}>Mode</Text>
        <Segmented
          options={[
            { value: 'AUTOMATIC', label: 'Automatic' },
            { value: 'MANUAL', label: 'Manual' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Text style={font.small}>
          {mode === 'AUTOMATIC'
            ? 'Attendance is sent to players automatically at the release time.'
            : 'Nothing is sent automatically. At the release time you get "Attendance is ready to send." and choose Send Now or Schedule Later.'}
        </Text>
      </Card>
      <Card>
        <Text style={font.heading}>Default release timing</Text>
        <View style={row}>
          <Text style={font.body}>Days before the Event</Text>
          <Stepper label="Days before the Event" value={days} min={0} max={30} onChange={setDays} />
        </View>
        <TimeField label="Release time" value={time} onChange={setTime} />
        {time && (
          <Text style={font.small}>
            {days === 0 ? `Same day at ${clock(time)}` : `${days} calendar ${days === 1 ? 'day' : 'days'} before, at ${clock(time)}`} in {team.timezone}.
          </Text>
        )}
      </Card>
      <Text style={font.small}>Events already scheduled with the old default move to the new timing. Custom schedules stay as they are.</Text>
      <ErrorText error={error} />
      <Button label="Save" busy={busy} onPress={() => void save()} />
      {saved && <Notice tone="positive" title="Saved" />}
    </>
  );
}
