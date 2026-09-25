// The signed-in player's own answer (spec §31, §32, §37). YES and NO only: there is no third choice.
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { DECLINE_REASON_MAX_LENGTH, standingOf, type EventRosterEntry } from '../../domain/index.ts';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { Button, ButtonRow, Card, ErrorText, Field, Notice } from '../../ui/components';
import { font, toneColors } from '../../ui/theme';

export function PlayerAttendance({
  eventId,
  entry,
  released,
  isManager,
  onChanged,
}: {
  eventId: string;
  entry: EventRosterEntry;
  released: boolean;
  isManager: boolean;
  onChanged: () => void;
}) {
  const [declining, setDeclining] = useState(false);
  const [changing, setChanging] = useState(false);
  const [reason, setReason] = useState(entry.reason ?? '');
  const { busy, error, run } = useAction();
  const standing = standingOf(entry);

  useEffect(() => {
    setReason(entry.reason ?? '');
  }, [entry.reason]);

  if (!released) {
    // A Manager on the roster already sees the release controls below.
    if (isManager) return null;
    return (
      <Card>
        <Text style={font.heading}>Attendance</Text>
        <Text style={font.small}>Your Manager hasn't sent the attendance request yet. You'll get a notification when it's ready.</Text>
      </Card>
    );
  }

  const respond = (response: 'YES' | 'NO') =>
    run(async () => {
      await api('respondAttendance', { eventId, response, ...(response === 'NO' && { reason: reason.trim() || null }) });
      setDeclining(false);
      setChanging(false);
      onChanged();
    });

  // Once answered, the answer shrinks to one line so the Event details and lineup come first.
  if (standing !== 'NO_RESPONSE' && !changing) {
    const shown = {
      ATTENDING: { tone: 'positive', title: "You're attending", body: null },
      NOT_ATTENDING: { tone: 'negative', title: "You're not attending", body: entry.reason ? `Reason: ${entry.reason}` : null },
      PENDING_APPROVAL: {
        tone: 'attention',
        title: 'Pending Approval',
        body: "The roster is full right now. If a spot opens, the earliest request gets it and you'll be notified.",
      },
    } as const;
    const s = shown[standing];
    return (
      <Notice tone={s.tone} title={s.title}>
        {s.body ? <Text style={[font.small, { color: toneColors[s.tone].fg }]}>{s.body}</Text> : null}
        <Button label="Change Answer" variant="ghost" onPress={() => setChanging(true)} style={{ minHeight: 0, alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      </Notice>
    );
  }

  return (
    <Card>
      <Text style={font.heading}>Are you attending?</Text>
      <ButtonRow>
        <Button
          label="Yes"
          icon="checkmark"
          variant={standing === 'ATTENDING' || standing === 'PENDING_APPROVAL' ? 'primary' : 'secondary'}
          busy={busy && !declining}
          disabled={busy}
          onPress={() => {
            setDeclining(false);
            if (standing !== 'ATTENDING' && standing !== 'PENDING_APPROVAL') void respond('YES');
            else setChanging(false);
          }}
          style={{ flex: 1 }}
        />
        <Button
          label="No"
          icon="close"
          variant={standing === 'NOT_ATTENDING' ? 'primary' : 'secondary'}
          disabled={busy}
          onPress={() => setDeclining(true)}
          style={{ flex: 1 }}
        />
      </ButtonRow>
      {declining && (
        <>
          <Field
            label="Reason (optional)"
            value={reason}
            onChangeText={setReason}
            maxLength={DECLINE_REASON_MAX_LENGTH}
            showCount
            placeholder="Out of town"
          />
          <ButtonRow>
            <Button label="Cancel" variant="secondary" onPress={() => setDeclining(false)} style={{ flex: 1 }} />
            <Button label={standing === 'NOT_ATTENDING' ? 'Update Reason' : 'Confirm No'} busy={busy} onPress={() => void respond('NO')} style={{ flex: 1 }} />
          </ButtonRow>
        </>
      )}
      {changing && !declining && <Button label="Keep My Answer" variant="ghost" onPress={() => setChanging(false)} />}
      <ErrorText error={error} />
    </Card>
  );
}
