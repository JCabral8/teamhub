// Who's coming, in order: attending (by Position for Managers), waiting for a spot, not attending,
// then no answer yet. Players see names and answers only: no Positions and nothing that marks a
// callup (spec §44, §45, §47).
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { groupRosterByPosition, standingOf, type EventRosterEntry, type PositionConfig, type RosterStanding } from '../../domain/index.ts';
import type { EventDetail } from '../../lib/data';
import { Avatar } from '../../ui/Avatar';
import { Badge, Card, ListRow, SectionLabel } from '../../ui/components';
import { font, space } from '../../ui/theme';

export interface ManagerLineup {
  config: PositionConfig;
  onSelect: (entry: EventRosterEntry) => void;
}

const byName = (a: EventRosterEntry, b: EventRosterEntry) => a.displayName.localeCompare(b.displayName);

export function Lineup({ detail, manager }: { detail: EventDetail; manager?: ManagerLineup }) {
  const { event, roster } = detail;
  const released = event.release_state === 'RELEASED';
  const heading = event.type === 'GAME' ? 'Lineup' : 'Going';
  const of = (s: RosterStanding) => roster.filter((e) => standingOf(e) === s).sort(byName);

  const row = (e: EventRosterEntry, i: number, badge?: ReactNode) => {
    const notes = manager
      ? [e.source === 'CALLUP' && 'Callup', e.responseOrigin === 'SYSTEM_AVAILABILITY' && 'Marked unavailable', e.response === 'NO' && e.reason]
      : [e.response === 'NO' && e.reason];
    const item = (
      <ListRow
        first={i === 0}
        title={e.displayName}
        leading={<Avatar name={e.displayName} path={detail.avatars[e.userId]} />}
        subtitle={notes.filter(Boolean).join(' · ') || null}
        right={badge}
      />
    );
    return manager ? (
      <Pressable key={e.userId} accessibilityRole="button" onPress={() => manager.onSelect(e)}>
        {item}
      </Pressable>
    ) : (
      <View key={e.userId}>{item}</View>
    );
  };

  const list = (entries: EventRosterEntry[], badge?: ReactNode) => (
    <Card style={{ paddingVertical: 0 }}>{entries.map((e, i) => row(e, i, badge))}</Card>
  );

  /** Managers see a card per Position; players one alphabetical list. */
  const byPosition = (entries: EventRosterEntry[], badge?: ReactNode) =>
    manager
      ? groupRosterByPosition(entries, manager.config).map((g) => (
          <Card key={g.positionId ?? 'none'} style={{ paddingVertical: space.sm, gap: 0 }}>
            <Text style={[font.label, { paddingTop: space.xs }]}>{`${g.name} (${g.entries.length})`}</Text>
            {g.entries.map((e, i) => row(e, i + 1, badge))}
          </Card>
        ))
      : list(entries, badge);

  if (!roster.length) return <Text style={font.small}>No one is on this roster yet.</Text>;

  if (!released) {
    return (
      <>
        <SectionLabel>{`Roster (${roster.length})`}</SectionLabel>
        <Text style={font.small}>Attendance hasn't been sent yet, so nobody has answered.</Text>
        {byPosition([...roster].sort(byName))}
      </>
    );
  }

  const attending = of('ATTENDING');
  const waiting = of('PENDING_APPROVAL');
  const declined = of('NOT_ATTENDING');
  const noAnswer = of('NO_RESPONSE');
  return (
    <>
      <SectionLabel>{`${heading} (${attending.length})`}</SectionLabel>
      {attending.length ? byPosition(attending) : <Text style={font.small}>Nobody has said Yes yet.</Text>}

      {waiting.length > 0 && (
        <>
          <SectionLabel>{`Waiting for a spot (${waiting.length})`}</SectionLabel>
          {list(waiting, <Badge label="Pending" tone="attention" />)}
        </>
      )}

      {declined.length > 0 && (
        <>
          <SectionLabel>{`Not attending (${declined.length})`}</SectionLabel>
          {list(declined)}
        </>
      )}

      {noAnswer.length > 0 && (
        <>
          <SectionLabel>{`No answer yet (${noAnswer.length})`}</SectionLabel>
          {list(noAnswer)}
        </>
      )}
    </>
  );
}
