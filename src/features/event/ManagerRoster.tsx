// Manager Event roster (spec §33–§36, §45, §49): summary, coverage warnings, Position groups, callups.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  calculateAttendanceCounts,
  calculatePositionCoverage,
  formatAttendanceSummary,
  groupRosterByPosition,
  standingOf,
  type EventRosterEntry,
} from '../../domain/index.ts';
import { api } from '../../lib/api';
import type { EventDetail, TeamDetail } from '../../lib/data';
import { useAction } from '../../lib/hooks';
import { Badge, Button, ButtonRow, Card, ErrorText, ListRow, Notice, SectionLabel, Sheet, Stepper } from '../../ui/components';
import { STANDING_DISPLAY } from '../../ui/format';
import { colors, font, space } from '../../ui/theme';
import { useAccent } from '../../ui/accent';
import { Avatar } from '../../ui/Avatar';

export function ManagerRoster({ detail, team, onChanged }: { detail: EventDetail; team: TeamDetail; onChanged: () => void }) {
  const { event, roster, requirements, invites } = detail;
  const released = event.release_state === 'RELEASED';
  const config = team.config;
  const counts = calculateAttendanceCounts(roster, config);
  const coverage = calculatePositionCoverage(roster, requirements, config);
  const groups = groupRosterByPosition(roster, config);
  const [selected, setSelected] = useState<EventRosterEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingNeeds, setEditingNeeds] = useState(false);
  const [callupResult, setCallupResult] = useState<string | null>(null);
  const act = useAction();
  const openCallups = new Set(invites.filter((i) => !i.closed_at && i.response === 'NO_RESPONSE').map((i) => i.user_id));
  const positionName = new Map(team.positions.map((p) => [p.id, p.name]));

  const runAction = (fn: () => Promise<unknown>) =>
    act.run(async () => {
      await fn();
      setSelected(null);
      onChanged();
    });

  return (
    <>
      <Card>
        <Text style={font.title}>{formatAttendanceSummary(counts, config)}</Text>
        <Text style={font.small}>
          {[
            counts.pendingApproval && `${counts.pendingApproval} Pending Approval`,
            `${counts.noResponse} No Response`,
            `${counts.notAttending} Not Attending`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {coverage.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {coverage.map((c) => (
              <Badge key={c.positionId} label={`${c.name} ${c.attending}/${c.required}`} tone={!released ? 'neutral' : c.short ? 'negative' : 'positive'} />
            ))}
          </View>
        )}
        {coverage.some((c) => c.short) && released && (
          <Text style={[font.small, { color: colors.negative }]}>
            {coverage
              .filter((c) => c.short)
              .map((c) => (c.isGoalie && c.attending === 0 ? `${c.name} missing` : `${c.name} below ${c.required}`))
              .join(' · ')}
          </Text>
        )}
        <ButtonRow>
          <Button label="Add Player" icon="person-add-outline" variant="secondary" onPress={() => setAdding(true)} style={{ flex: 1 }} />
          <Button label="Needs" icon="options-outline" variant="secondary" onPress={() => setEditingNeeds(true)} style={{ flex: 1 }} />
        </ButtonRow>
        {released && (
          <Button
            label="Find Callups"
            icon="search-outline"
            variant="ghost"
            busy={act.busy && !selected}
            onPress={() =>
              void runAction(async () => {
                setCallupResult(null);
                const { invited } = await api<{ invited: number }>('runCallupSelection', { eventId: event.id });
                setCallupResult(
                  invited
                    ? `Invited ${invited} ${invited === 1 ? 'callup' : 'callups'}.`
                    : 'No callups invited. Either no spots are open, or no callups are available for them.',
                );
              })
            }
          />
        )}
        {callupResult && <Text style={font.small}>{callupResult}</Text>}
        <ErrorText error={!selected && !adding ? act.error : null} />
      </Card>

      {counts.pendingApproval > 0 && (
        <Notice tone="attention" title="Roster discrepancy">
          Players marked Pending Approval said Yes after the roster filled. The earliest request gets the next open spot automatically.
        </Notice>
      )}

      {groups.map((g) => (
        <View key={g.positionId ?? 'none'} style={{ gap: space.md }}>
          {/* The number is attending players only (spec §35). */}
          <SectionLabel>{`${g.name} (${g.count})`}</SectionLabel>
          <Card style={{ paddingVertical: 0 }}>
            {g.entries.map((e, i) => {
              const s = STANDING_DISPLAY[standingOf(e)];
              return (
                <Pressable key={e.userId} accessibilityRole="button" onPress={() => setSelected(e)}>
                  <ListRow
                    first={i === 0}
                    title={e.displayName}
                    leading={<Avatar name={e.displayName} path={detail.avatars[e.userId]} />}
                    subtitle={[e.source === 'CALLUP' && 'Callup', e.responseOrigin === 'SYSTEM_AVAILABILITY' && 'Marked unavailable', e.response === 'NO' && e.reason]
                      .filter(Boolean)
                      .join(' · ')}
                    right={<Badge label={s.label} tone={s.tone} />}
                  />
                </Pressable>
              );
            })}
          </Card>
        </View>
      ))}
      {!roster.length && <Text style={font.small}>No one is on this Event roster yet.</Text>}

      {invites.length > 0 && (
        <>
          <SectionLabel>Callup invitations</SectionLabel>
          <Card style={{ paddingVertical: 0 }}>
            {invites.map((inv, i) => {
              const name = roster.find((r) => r.userId === inv.user_id)?.displayName ?? 'Former invitee';
              const status = inv.response === 'YES' ? 'Accepted' : inv.response === 'NO' ? 'Declined' : inv.closed_at ? 'Closed' : 'Waiting';
              return (
                <ListRow
                  key={`${inv.user_id}-${i}`}
                  first={i === 0}
                  title={name}
                  subtitle={`${inv.target_position_id ? `For ${positionName.get(inv.target_position_id) ?? 'Position'}` : 'Any skater spot'} · #${inv.rank} in pool`}
                  right={<Badge label={status} tone={status === 'Accepted' ? 'positive' : status === 'Declined' ? 'negative' : 'neutral'} />}
                />
              );
            })}
          </Card>
        </>
      )}

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.displayName ?? ''}>
        {selected && (
          <>
            <Text style={font.small}>
              {STANDING_DISPLAY[standingOf(selected)].label}
              {selected.positionId ? ` · ${positionName.get(selected.positionId) ?? ''}` : ''}
            </Text>
            {openCallups.has(selected.userId) && (
              <Button
                label="Close Response Window"
                variant="secondary"
                busy={act.busy}
                onPress={() => void runAction(() => api('closeCallupInvitation', { eventId: event.id, userId: selected.userId }))}
              />
            )}
            <Button
              label="Remove from Event"
              variant="danger"
              busy={act.busy}
              onPress={() => void runAction(() => api('removeEventPlayer', { eventId: event.id, userId: selected.userId }))}
            />
            <ErrorText error={act.error} />
          </>
        )}
      </Sheet>

      <AddPlayerSheet visible={adding} onClose={() => setAdding(false)} detail={detail} team={team} onAdded={onChanged} />
      <RequirementsSheet visible={editingNeeds} onClose={() => setEditingNeeds(false)} detail={detail} team={team} onSaved={onChanged} />
    </>
  );
}

function AddPlayerSheet({ visible, onClose, detail, team, onAdded }: { visible: boolean; onClose: () => void; detail: EventDetail; team: TeamDetail; onAdded: () => void }) {
  const released = detail.event.release_state === 'RELEASED';
  const onEvent = new Set(detail.roster.map((r) => r.userId));
  const candidates = team.members.filter((m) => m.status === 'ACTIVE' && !onEvent.has(m.user_id));
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
      {candidates.length ? (
        <View>
          {candidates.map((m, i) => (
            <Pressable key={m.id} accessibilityRole="radio" accessibilityState={{ checked: chosen === m.id }} onPress={() => setChosen(m.id)}>
              <ListRow
                first={i === 0}
                title={m.display_name}
                leading={<Avatar name={m.display_name} path={m.avatar_path} />}
                subtitle={m.roster_role === 'CALLUP' ? 'Callup' : m.roster_role === 'NONE' ? 'Not on the default roster' : null}
                right={chosen === m.id ? <Ionicons name="checkmark-circle" size={22} color={accent.ink} /> : undefined}
              />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={font.small}>Everyone on the Team is already on this Event.</Text>
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

/** Per-Event quantities, starting from the snapshot of the Team default (spec §21). */
function RequirementsSheet({ visible, onClose, detail, team, onSaved }: { visible: boolean; onClose: () => void; detail: EventDetail; team: TeamDetail; onSaved: () => void }) {
  const editable = team.positions.filter((p) => p.kind !== 'HYBRID' && (p.kind !== 'GOALIE' || team.config.goalieEnabled));
  const initial = () => Object.fromEntries(editable.map((p) => [p.id, detail.requirements.find((r) => r.positionId === p.id)?.quantity ?? 0]));
  const [values, setValues] = useState<Record<string, number>>(initial);
  const { busy, error, setError, run } = useAction();
  // Start from the Event's current needs each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setValues(initial());
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const save = () =>
    run(async () => {
      await api('setEventRequirements', {
        eventId: detail.event.id,
        requirements: Object.entries(values)
          .filter(([, q]) => q > 0)
          .map(([positionId, quantity]) => ({ positionId, quantity })),
      });
      onClose();
      onSaved();
    });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Roster needs for this Event"
    >
      <Text style={font.small}>Changes apply to this Event only. The Team default roster stays the same.</Text>
      {editable.map((p) => (
        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={font.body}>{p.name}</Text>
          <Stepper label={p.name} value={values[p.id] ?? 0} onChange={(v) => setValues({ ...values, [p.id]: v })} />
        </View>
      ))}
      <ErrorText error={error} />
      <ButtonRow>
        <Button label="Reset" variant="secondary" onPress={() => setValues(initial())} style={{ flex: 1 }} />
        <Button label="Save" busy={busy} onPress={() => void save()} style={{ flex: 1 }} />
      </ButtonRow>
    </Sheet>
  );
}
