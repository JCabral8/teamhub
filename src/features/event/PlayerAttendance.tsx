// The signed-in player's own answer (spec §31, §32, §37; wireframes 6B–6E and 4A–4B). Yes and No
// only: the app has no Maybe. Every answer is confirmed in a dialog before it is saved.
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DECLINE_REASON_MAX_LENGTH, standingOf, type EventRosterEntry, type RosterStanding } from '../../domain/index.ts';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { Badge, Button, ButtonRow, Dialog, ErrorText, Field, Notice } from '../../ui/components';
import { StandingPill } from '../../ui/EventTypeIcon';
import { font, space } from '../../ui/theme';

/** Body and footer for the player's part of the Event screen; the footer holds the Yes/No buttons. */
export function usePlayerAttendance({
  eventId,
  entry,
  released,
  isManager,
  onChanged,
}: {
  eventId: string;
  entry: EventRosterEntry | undefined;
  released: boolean;
  /** A Manager on the roster already sees the release controls, so nothing shows before release. */
  isManager: boolean;
  onChanged: () => void;
}): { body: ReactNode; footer: ReactNode } {
  const [confirming, setConfirming] = useState<'YES' | 'NO' | null>(null);
  const [changing, setChanging] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [reason, setReason] = useState(entry?.reason ?? '');
  const { busy, error, setError, run } = useAction();

  useEffect(() => {
    setReason(entry?.reason ?? '');
  }, [entry?.reason]);

  if (!entry || (!released && isManager)) return { body: null, footer: null };
  if (!released) {
    return {
      body: (
        <Notice tone="neutral" title="Attendance not sent yet" icon="alarm-outline">
          Your Manager hasn't sent the attendance request yet. You'll get a notification when it's ready.
        </Notice>
      ),
      footer: null,
    };
  }

  const standing = standingOf(entry);
  const answering = standing === 'NO_RESPONSE' || changing;

  const respond = (response: 'YES' | 'NO') =>
    run(async () => {
      await api('respondAttendance', { eventId, response, ...(response === 'NO' && { reason: reason.trim() || null }) });
      setConfirming(null);
      setChanging(false);
      setJustSaved(true);
      onChanged();
    });

  const open = (answer: 'YES' | 'NO') => {
    setError(null);
    setConfirming(answer);
  };

  const body = (
    <View style={{ gap: space.md }}>
      <View style={styles.statusRow}>
        <Text style={[font.body, { fontWeight: '700', flex: 1 }]}>My Status</Text>
        {standing === 'NO_RESPONSE' ? <Badge label="Not Responded" tone="neutral" /> : <StandingPill standing={standing} />}
      </View>
      {!answering && justSaved && <SavedNotice standing={standing} />}
      {!answering && !justSaved && standing === 'PENDING_APPROVAL' && <SavedNotice standing={standing} />}
      {!answering && standing === 'NOT_ATTENDING' && entry.reason ? <Text style={font.small}>Reason: {entry.reason}</Text> : null}
      {!answering && (
        <Button
          label={standing === 'PENDING_APPROVAL' ? 'Change to No' : 'Change Response'}
          variant="secondary"
          onPress={() => {
            setJustSaved(false);
            if (standing === 'PENDING_APPROVAL') open('NO');
            else setChanging(true);
          }}
        />
      )}
      {changing && <Button label="Keep My Answer" variant="ghost" size="sm" onPress={() => setChanging(false)} />}
      <ErrorText error={!confirming ? error : null} />

      <Dialog
        visible={confirming === 'YES'}
        onClose={() => setConfirming(null)}
        title="Confirm Response"
        body="Are you sure you want to mark yourself as Attending?"
      >
        <View style={{ gap: space.sm }}>
          <Button label="Yes, I'll be there" variant="success" busy={busy} onPress={() => void respond('YES')} />
          <Button label="Cancel" variant="secondary" onPress={() => setConfirming(null)} />
          <ErrorText error={error} />
        </View>
      </Dialog>
      <Dialog visible={confirming === 'NO'} onClose={() => setConfirming(null)} title="Confirm Response" body="Are you sure you want to mark yourself as Not Attending?">
        <View style={{ gap: space.sm }}>
          <Field
            label="Reason (optional)"
            value={reason}
            onChangeText={setReason}
            maxLength={DECLINE_REASON_MAX_LENGTH}
            showCount
            placeholder="Out of town"
          />
          <Button label="No, I can't make it" variant="destructive" busy={busy} onPress={() => void respond('NO')} />
          <Button label="Cancel" variant="secondary" onPress={() => setConfirming(null)} />
          <ErrorText error={error} />
        </View>
      </Dialog>
    </View>
  );

  const footer = answering ? (
    <ButtonRow>
      <Button label="Yes" icon="checkmark" variant="success" disabled={busy || standing === 'ATTENDING' || standing === 'PENDING_APPROVAL'} onPress={() => open('YES')} style={{ flex: 1 }} />
      <Button label="No" icon="close" variant="destructive" disabled={busy || (standing === 'NOT_ATTENDING' && !changing)} onPress={() => open('NO')} style={{ flex: 1 }} />
    </ButtonRow>
  ) : null;

  return { body, footer };
}

function SavedNotice({ standing }: { standing: RosterStanding }) {
  switch (standing) {
    case 'ATTENDING':
      return <Notice tone="positive">Your response has been saved. You're all set!</Notice>;
    case 'NOT_ATTENDING':
      return <Notice tone="negative">You've marked yourself as Not Attending.</Notice>;
    case 'PENDING_APPROVAL':
      return (
        <Notice tone="attention" title="Pending Approval" icon="time">
          The roster is full, so you're on the waitlist. If a spot opens, the earliest request gets it and you'll be notified.
        </Notice>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
