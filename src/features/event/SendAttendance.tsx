// Manager release controls (spec §26–§29; wireframe 1 "Attendance Scheduling Flow"): not yet sent,
// scheduled, or sent. Send Attendance asks Send Now or Schedule Later.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { localDate, localTime } from '../../domain/index.ts';
import { api } from '../../lib/api';
import type { Team, TeamEvent } from '../../lib/data';
import { useAction } from '../../lib/hooks';
import { shareOrCopy } from '../../lib/share';
import { Button, ButtonRow, Dialog, ErrorText, Notice } from '../../ui/components';
import { clock, eventLink, eventTitle, eventWhen, shortDate } from '../../ui/format';
import { font, space, toneColors } from '../../ui/theme';

export function SendAttendance({ event, team, onChanged }: { event: TeamEvent; team: Team; onChanged: () => void }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState(false);
  const { busy, error, run } = useAction();

  const sendNow = () =>
    run(async () => {
      await api('sendAttendanceNow', { eventId: event.id });
      setAsking(false);
      onChanged();
    });
  const holdOff = () =>
    run(async () => {
      await api('holdAttendance', { eventId: event.id });
      onChanged();
    });
  const scheduleLater = () => {
    setAsking(false);
    router.push({ pathname: '/event/[id]/schedule-attendance', params: { id: event.id } });
  };
  const open = (path: '/event/[id]/roster' | '/event/[id]/callups') => router.push({ pathname: path, params: { id: event.id } });

  if (event.release_state === 'RELEASED') {
    // No timestamp of when it was sent (spec §28). On the web there's no push, so a link in the team chat tells players.
    const share = async () => {
      const message = `Attendance is open for ${eventTitle(event)}, ${eventWhen(event.starts_at, team.timezone)}. Tap to answer: ${eventLink(event.id)}`;
      if (await shareOrCopy(message)) setCopied(true);
    };
    return (
      <View style={{ gap: space.md }}>
        <Notice tone="positive" title="Attendance Sent">
          <Text style={[font.small, { color: toneColors.positive.fg }]}>Players have been notified.</Text>
        </Notice>
        <ButtonRow>
          <Button label="View Responses" variant="secondary" size="sm" onPress={() => open('/event/[id]/roster')} style={{ flex: 1 }} />
          <Button label="Manage Callups" variant="secondary" size="sm" onPress={() => open('/event/[id]/callups')} style={{ flex: 1 }} />
        </ButtonRow>
        <Button label={copied ? 'Message Copied' : 'Share to Team Chat'} icon={copied ? 'checkmark' : 'share-outline'} variant="ghost" size="sm" onPress={() => void share()} />
      </View>
    );
  }

  const at = event.release_at ? new Date(event.release_at) : null;
  const scheduled = event.release_state === 'SCHEDULED' && at;
  return (
    <View style={{ gap: space.md }}>
      {scheduled ? (
        <>
          <Notice tone="attention" icon="alarm" title={event.release_action === 'NOTIFY_MANAGER' ? 'Reminder Scheduled' : 'Scheduled'}>
            <Text style={[font.body, { color: toneColors.attention.fg }]}>
              {shortDate(localDate(at, team.timezone), false)} • {clock(localTime(at, team.timezone))}
            </Text>
            {event.release_action === 'NOTIFY_MANAGER' ? (
              <Text style={[font.small, { color: toneColors.attention.fg }]}>Manual mode: you'll be reminded to send it. Nothing goes out on its own.</Text>
            ) : null}
          </Notice>
          <ButtonRow>
            <Button label="Change Schedule" variant="secondary" size="sm" onPress={scheduleLater} style={{ flex: 1 }} />
            <Button label="Send Now" size="sm" busy={busy && !asking} onPress={() => void sendNow()} style={{ flex: 1 }} />
          </ButtonRow>
          <Button label="Hold Off" variant="ghost" size="sm" disabled={busy} onPress={() => void holdOff()} />
        </>
      ) : (
        <>
          <Notice tone="neutral" icon="alarm-outline" title="Not yet sent">
            No attendance request has been sent to the team.
          </Notice>
          <Button label="Send Attendance" onPress={() => setAsking(true)} />
        </>
      )}
      <ErrorText error={!asking ? error : null} />

      <Dialog visible={asking} onClose={() => setAsking(false)} title="Send Attendance" body="When would you like attendance sent for this Event?">
        <View style={{ gap: space.xs }}>
          <Button label="Send Now" busy={busy} onPress={() => void sendNow()} />
          <Text style={[font.small, { textAlign: 'center' }]}>Sends the attendance request immediately.</Text>
        </View>
        <View style={{ gap: space.xs }}>
          <Button label="Schedule Later" variant="secondary" onPress={scheduleLater} />
          <Text style={[font.small, { textAlign: 'center' }]}>Choose a future date and time.</Text>
        </View>
        <Button label="Cancel" variant="neutral" onPress={() => setAsking(false)} />
        <ErrorText error={error} />
      </Dialog>
    </View>
  );
}
