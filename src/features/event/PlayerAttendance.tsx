// The signed-in player's own answer (spec §31, §32, §37). YES and NO only: there is no third choice.
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { DECLINE_REASON_MAX_LENGTH, standingOf, type EventRosterEntry } from '../../domain/index.ts';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { Button, ButtonRow, Card, ErrorText, Field, Notice } from '../../ui/components';
import { font } from '../../ui/theme';

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
      onChanged();
    });

  return (
    <Card>
      <Text style={font.heading}>Are you attending?</Text>
      {standing === 'ATTENDING' && <Notice tone="positive" title="You're attending" />}
      {standing === 'NOT_ATTENDING' && (
        <Notice tone="negative" title="You're not attending">
          {entry.reason ? `Reason: ${entry.reason}` : undefined}
        </Notice>
      )}
      {standing === 'PENDING_APPROVAL' && (
        <Notice tone="attention" title="Pending Approval">
          The roster is full right now. If a spot opens, the earliest request gets it and you'll be notified.
        </Notice>
      )}
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
      <ErrorText error={error} />
    </Card>
  );
}
