// Team Settings → Notification Settings (wireframe 6b): the "New Event" notice to players and the
// Manager reminder about unanswered attendance (spec §54).
import { useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { Button, Card, ErrorText, Notice, Stepper, ToggleRow } from '../../ui/components';
import { font, space } from '../../ui/theme';
import type { SectionProps } from './types';

export function NotificationSettings({ membership, reload }: SectionProps) {
  const team = membership.team;
  const [newEvents, setNewEvents] = useState(team.notify_new_events);
  const [reminder, setReminder] = useState(team.reminder_enabled);
  const [hours, setHours] = useState(team.reminder_hours_before);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();

  const save = () =>
    run(async () => {
      setSaved(false);
      await api('updateTeamSettings', { teamId: team.id, notifyNewEvents: newEvents, reminderEnabled: reminder, reminderHoursBefore: hours });
      await reload();
      setSaved(true);
    });

  return (
    <>
      <Card>
        <Text style={font.heading}>Players</Text>
        <ToggleRow
          label="Notify players about new Events"
          hint="Players on the roster get a “New Event” notification when you create one. You can change it for each Event when you create it."
          value={newEvents}
          onChange={setNewEvents}
        />
      </Card>
      <Card>
        <Text style={font.heading}>Managers</Text>
        <ToggleRow label="Attendance reminder" hint='"X people have not completed their attendance."' value={reminder} onChange={setReminder} />
        {reminder && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
            <Text style={font.body}>Hours before the Event</Text>
            <Stepper label="Hours before the Event" value={hours} min={1} max={168} onChange={setHours} />
          </View>
        )}
      </Card>
      <Text style={font.small}>Players choose whether their phone shows notifications in the phone's settings for TeamHub.</Text>
      <ErrorText error={error} />
      <Button label="Save" busy={busy} onPress={() => void save()} />
      {saved && <Notice tone="positive" title="Saved" />}
    </>
  );
}
