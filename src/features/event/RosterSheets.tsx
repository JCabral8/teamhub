// Manager sheets on the Event roster: one player's actions, and adding a player (spec §48, §49).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { standingOf, type EventRosterEntry } from '../../domain/index.ts';
import { api } from '../../lib/api';
import type { EventDetail, TeamDetail } from '../../lib/data';
import { useAction } from '../../lib/hooks';
import { useAccent } from '../../ui/accent';
import { Avatar } from '../../ui/Avatar';
import { Button, ErrorText, ListRow, SearchField, Sheet } from '../../ui/components';
import { StandingPill } from '../../ui/EventTypeIcon';
import { colors, font, space } from '../../ui/theme';

export function PlayerActionsSheet({
  entry,
  detail,
  positionName,
  onClose,
  onChanged,
}: {
  entry: EventRosterEntry | null;
  detail: EventDetail;
  positionName: Map<string, string>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { busy, error, setError, run } = useAction();
  if (!entry) return null;
  const released = detail.event.release_state === 'RELEASED';
  const invite = detail.invites.find((i) => i.user_id === entry.userId && !i.closed_at && i.response === 'NO_RESPONSE');
  const close = () => {
    setError(null);
    onClose();
  };
  const exec = (command: string) =>
    run(async () => {
      await api(command, { eventId: detail.event.id, userId: entry.userId });
      close();
      onChanged();
    });

  return (
    <Sheet visible onClose={close} title={entry.displayName}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar name={entry.displayName} path={detail.avatars[entry.userId]} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={font.body}>{[entry.positionId ? positionName.get(entry.positionId) : 'No Position', entry.source === 'CALLUP' ? 'Callup' : null].filter(Boolean).join(' · ')}</Text>
          {entry.responseOrigin === 'SYSTEM_AVAILABILITY' && <Text style={font.small}>Marked unavailable for this date</Text>}
          {entry.response === 'NO' && entry.reason ? <Text style={font.small}>Reason: {entry.reason}</Text> : null}
        </View>
        <StandingPill standing={standingOf(entry)} released={released} short />
      </View>
      {invite && (
        <>
          <Button label="Close Response Window" variant="secondary" busy={busy} onPress={() => void exec('closeCallupInvitation')} />
          <Text style={font.small}>Takes them off this Event and invites the next callup.</Text>
        </>
      )}
      <Button label="Remove from Event" variant="danger" busy={busy} onPress={() => void exec('removeEventPlayer')} />
      <ErrorText error={error} />
    </Sheet>
  );
}

export function AddPlayerSheet({ visible, onClose, detail, team, onAdded }: { visible: boolean; onClose: () => void; detail: EventDetail; team: TeamDetail; onAdded: () => void }) {
  const released = detail.event.release_state === 'RELEASED';
  const onEvent = new Set(detail.roster.map((r) => r.userId));
  const [query, setQuery] = useState('');
  const candidates = team.members.filter((m) => m.status === 'ACTIVE' && !onEvent.has(m.user_id) && m.display_name.toLowerCase().includes(query.trim().toLowerCase()));
  const positionName = new Map(team.positions.map((p) => [p.id, p.name]));
  const [chosen, setChosen] = useState<string | null>(null);
  const accent = useAccent();
  const { busy, error, setError, run } = useAction();
  const close = () => {
    setChosen(null);
    setError(null);
    onClose();
  };

  const add = (sendAttendanceRequest: boolean) =>
    run(async () => {
      await api('addEventPlayer', { eventId: detail.event.id, membershipId: chosen, sendAttendanceRequest });
      close();
      onAdded();
    });

  return (
    <Sheet visible={visible} onClose={close} title="Add Player">
      <SearchField value={query} onChangeText={setQuery} />
      {candidates.length ? (
        <View>
          {candidates.map((m, i) => (
            <ListRow
              key={m.id}
              first={i === 0}
              title={m.display_name}
              leading={<Avatar name={m.display_name} path={m.avatar_path} size={32} />}
              subtitle={[m.position_id ? positionName.get(m.position_id) : null, m.roster_role === 'CALLUP' ? 'Callup' : m.roster_role === 'NONE' ? 'Not on the default roster' : null]
                .filter(Boolean)
                .join(' · ')}
              right={chosen === m.id ? <Ionicons name="checkmark-circle" size={22} color={accent.ink} /> : <Ionicons name="ellipse-outline" size={22} color={colors.disabled} />}
              onPress={() => setChosen(m.id)}
            />
          ))}
        </View>
      ) : (
        <Text style={font.small}>{query ? 'No one matches.' : 'Everyone on the Team is already on this Event.'}</Text>
      )}
      {released ? (
        <>
          <Button label="Send Attendance Request" disabled={!chosen} busy={busy} onPress={() => void add(true)} />
          <Button label="Add Without Attendance Request" variant="secondary" disabled={!chosen} busy={busy} onPress={() => void add(false)} />
          <Text style={font.small}>Adding without a request marks them attending right away, if the roster has room.</Text>
        </>
      ) : (
        <Button label="Add to Event" disabled={!chosen} busy={busy} onPress={() => void add(true)} />
      )}
      <ErrorText error={error} />
    </Sheet>
  );
}
