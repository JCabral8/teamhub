// The signed-in player's own answer (spec §31, §32, §37; wireframes 4, 6 and 7): Yes, No or Maybe,
// each confirmed in a dialog before it is saved. Callups see that it's a callup invitation and the
// Position needed, and a "You're In!" screen when they accept.
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DECLINE_REASON_MAX_LENGTH, standingOf, type AttendanceAnswer, type EventRosterEntry, type RosterStanding } from '../../domain/index.ts';
import { api } from '../../lib/api';
import type { MyCallup } from '../../lib/data';
import { useAction } from '../../lib/hooks';
import { Badge, Button, ButtonRow, Card, Dialog, ErrorText, Field, IconCircle, Notice, SuccessState } from '../../ui/components';
import { StandingPill } from '../../ui/EventTypeIcon';
import { colors, font, space } from '../../ui/theme';

/** Body and footer for the player's part of the Event screen; the footer holds the answer buttons. */
export function usePlayerAttendance({
  eventId,
  eventTitle,
  entry,
  callup,
  released,
  isManager,
  onChanged,
}: {
  eventId: string;
  eventTitle: string;
  entry: EventRosterEntry | undefined;
  /** The player's own callup invitation for this Event, if they were invited as a callup. */
  callup: MyCallup | undefined;
  released: boolean;
  /** A Manager on the roster already sees the release controls, so nothing shows before release. */
  isManager: boolean;
  onChanged: () => void;
}): { body: ReactNode; footer: ReactNode; title: string | null } {
  const router = useRouter();
  const [confirming, setConfirming] = useState<AttendanceAnswer | null>(null);
  const [rosterFull, setRosterFull] = useState(false);
  const [changing, setChanging] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [reason, setReason] = useState(entry?.reason ?? '');
  const { busy, error, setError, run } = useAction();

  useEffect(() => {
    setReason(entry?.reason ?? '');
  }, [entry?.reason]);

  const isCallup = !!callup && !callup.closed && !!entry;

  // Taken off the callup list, or the spot was filled (wireframe 7 "Callup No Longer Needed").
  if (!entry && callup?.closed) {
    return {
      title: null,
      body: (
        <Notice tone="neutral" title="Callup No Longer Needed" icon="checkmark-done">
          The callup opportunity has been filled. Thanks for being available!
        </Notice>
      ),
      footer: null,
    };
  }
  if (!entry || (!released && isManager)) return { title: null, body: null, footer: null };
  if (!released) {
    return {
      title: null,
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

  const respond = (response: AttendanceAnswer) =>
    run(async () => {
      const res = await api<{ standing: RosterStanding }>('respondAttendance', {
        eventId,
        response,
        ...(response === 'NO' && { reason: reason.trim() || null }),
      });
      setConfirming(null);
      setChanging(false);
      setJustSaved(true);
      if (isCallup && res.standing === 'ATTENDING') setCelebrate(true);
      onChanged();
    });

  const open = async (answer: AttendanceAnswer) => {
    setError(null);
    setRosterFull(false);
    setConfirming(answer);
    // Wireframe 4A: warn before a Yes that would only put them on the waitlist.
    if (answer === 'YES' && !isCallup) {
      const preview = await api<{ rosterFull: boolean }>('previewAttendance', { eventId }).catch(() => null);
      setRosterFull(!!preview?.rosterFull);
    }
  };

  if (celebrate && standing === 'ATTENDING') {
    return {
      title: null,
      body: (
        <View style={{ gap: space.md }}>
          <SuccessState title="You're In!" body={`You've accepted the callup for ${eventTitle}.`} />
          <Card style={styles.addedCard}>
            <View style={styles.addedRow}>
              <IconCircle icon="calendar" color={colors.primary} bg={colors.surface} />
              <View style={{ flex: 1 }}>
                <Text style={[font.body, { fontWeight: '700' }]}>Added to My Schedule</Text>
                <Text style={font.small}>This event has been added to your schedule.</Text>
              </View>
            </View>
          </Card>
          <Button label="View Event" onPress={() => setCelebrate(false)} />
          <Button label="Back to Home" variant="secondary" onPress={() => router.dismissTo('/')} />
        </View>
      ),
      footer: null,
    };
  }

  const body = (
    <View style={{ gap: space.md }}>
      {isCallup && (
        <>
          <Notice tone="primary">We need a callup for this event. Please respond as soon as possible.</Notice>
          {callup.position_name ? (
            <View>
              <Text style={[font.body, { fontWeight: '700' }]}>Position Needed</Text>
              <Text style={font.body}>{callup.position_name}</Text>
            </View>
          ) : null}
        </>
      )}
      <View style={styles.statusRow}>
        <Text style={[font.body, { fontWeight: '700', flex: 1 }]}>{isCallup ? 'Your Response' : 'My Status'}</Text>
        {standing === 'NO_RESPONSE' ? <Badge label="Not Responded" tone="neutral" /> : <StandingPill standing={standing} />}
      </View>
      {!answering && justSaved && <SavedNotice standing={standing} />}
      {!answering && !justSaved && standing === 'PENDING_APPROVAL' && <SavedNotice standing={standing} />}
      {!answering && standing === 'NOT_ATTENDING' && entry.responseOrigin === 'MANAGER' && !isCallup && (
        <Notice tone="neutral" title="Not Selected" icon="information-circle">
          A spot did not become available for this event. Your status is Not Attending.
        </Notice>
      )}
      {!answering && standing === 'NOT_ATTENDING' && entry.reason ? <Text style={font.small}>Reason: {entry.reason}</Text> : null}
      {!answering && (
        <Button
          label={standing === 'PENDING_APPROVAL' ? 'Change to No' : 'Change Response'}
          variant="secondary"
          onPress={() => {
            setJustSaved(false);
            if (standing === 'PENDING_APPROVAL') void open('NO');
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
        body={isCallup ? 'Are you sure you want to accept this callup?' : 'Are you sure you want to mark yourself as Attending?'}
      >
        <View style={{ gap: space.sm }}>
          {rosterFull && (
            <Notice tone="attention" title="Roster is full" icon="warning">
              Your response will be added as Pending Approval. You'll be notified if a spot becomes available.
            </Notice>
          )}
          <Button label="Yes, I'll be there" variant="success" busy={busy} onPress={() => void respond('YES')} />
          <Button label="Cancel" variant="secondary" onPress={() => setConfirming(null)} />
          <ErrorText error={error} />
        </View>
      </Dialog>
      <Dialog visible={confirming === 'NO'} onClose={() => setConfirming(null)} title="Confirm Response" body="Are you sure you want to mark yourself as Not Attending?">
        <View style={{ gap: space.sm }}>
          <Field label="Reason (optional)" value={reason} onChangeText={setReason} maxLength={DECLINE_REASON_MAX_LENGTH} showCount placeholder="Out of town" />
          <Button label="No, I can't make it" variant="destructive" busy={busy} onPress={() => void respond('NO')} />
          <Button label="Cancel" variant="secondary" onPress={() => setConfirming(null)} />
          <ErrorText error={error} />
        </View>
      </Dialog>
      <Dialog visible={confirming === 'MAYBE'} onClose={() => setConfirming(null)} title="Confirm Response" body="Are you sure you want to mark yourself as Maybe?">
        <View style={{ gap: space.sm }}>
          <Text style={font.small}>You'll be marked as maybe. Your Manager may follow up.</Text>
          <Button label="Maybe – not sure yet" busy={busy} onPress={() => void respond('MAYBE')} />
          <Button label="Cancel" variant="secondary" onPress={() => setConfirming(null)} />
          <ErrorText error={error} />
        </View>
      </Dialog>
    </View>
  );

  const footer = answering ? (
    <ButtonRow>
      <Button label="Yes" variant="success" disabled={busy || standing === 'ATTENDING' || standing === 'PENDING_APPROVAL'} onPress={() => void open('YES')} style={{ flex: 1 }} />
      <Button label="No" variant="destructive" disabled={busy || (standing === 'NOT_ATTENDING' && !changing)} onPress={() => void open('NO')} style={{ flex: 1 }} />
      <Button label="Maybe" variant="secondary" disabled={busy || standing === 'MAYBE'} onPress={() => void open('MAYBE')} style={{ flex: 1 }} />
    </ButtonRow>
  ) : null;

  return { title: isCallup ? 'Callup Invitation' : null, body, footer };
}

function SavedNotice({ standing }: { standing: RosterStanding }) {
  switch (standing) {
    case 'ATTENDING':
      return <Notice tone="positive">Your response has been saved. You're all set!</Notice>;
    case 'NOT_ATTENDING':
      return <Notice tone="negative">You've marked yourself as Not Attending.</Notice>;
    case 'MAYBE':
      return <Notice tone="primary">You've marked yourself as Maybe. Your Manager may follow up.</Notice>;
    case 'PENDING_APPROVAL':
      return (
        <Notice tone="attention" title="Pending Approval" icon="time">
          You're on the waitlist for this event. You will be notified if a spot becomes available.
        </Notice>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  addedCard: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  addedRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
