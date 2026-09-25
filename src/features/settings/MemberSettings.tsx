// Join approvals, official Positions, roster roles and Manager governance (spec §2, §5, §6, §53, §56).
import { useState } from 'react';
import { Text, View } from 'react-native';
import { canAssignAssistant, canRemoveAssistantRole, canRemoveMember, isTeamManager, sortPositions, type RosterRole } from '../../domain/index.ts';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { TeamMember } from '../../lib/data';
import { useAction } from '../../lib/hooks';
import { useTeams } from '../../lib/teams';
import { Badge, Button, ButtonRow, Card, Chips, ErrorText, ListRow, SectionLabel, Sheet } from '../../ui/components';
import { font, space } from '../../ui/theme';
import type { SectionProps } from './types';

const ROLE_OPTIONS: { value: RosterRole; label: string }[] = [
  { value: 'ROSTER', label: 'Default roster' },
  { value: 'CALLUP', label: 'Callup' },
  { value: 'NONE', label: 'Not playing' },
];
const roleLabel = (r: RosterRole) => ROLE_OPTIONS.find((o) => o.value === r)!.label;

export function MemberSettings({ membership, detail, reload }: SectionProps) {
  const { userId } = useAuth();
  const teams = useTeams();
  const actor = { userId: userId ?? '', role: membership.manager_role };
  const positions = sortPositions(detail.positions).filter((p) => p.kind !== 'GOALIE' || detail.config.goalieEnabled);
  const positionOptions = positions.map((p) => ({ value: p.id, label: p.name }));
  const positionName = new Map(positions.map((p) => [p.id, p.name]));
  const pending = detail.members.filter((m) => m.status === 'PENDING');
  const active = detail.members.filter((m) => m.status === 'ACTIVE');
  const [selected, setSelected] = useState<TeamMember | null>(null);

  return (
    <>
      <SectionLabel>{`Join requests (${pending.length})`}</SectionLabel>
      {pending.length ? (
        pending.map((m) => <JoinRequest key={m.id} member={m} positionOptions={positionOptions} reload={reload} />)
      ) : (
        <Text style={font.small}>No one is waiting to join.</Text>
      )}

      <SectionLabel>{`Members (${active.length})`}</SectionLabel>
      <Card style={{ paddingVertical: 0 }}>
        {active.map((m, i) => (
          <ListRow
            key={m.id}
            first={i === 0}
            title={m.display_name}
            subtitle={[m.position_id ? positionName.get(m.position_id) : 'No Position', roleLabel(m.roster_role)].join(' · ')}
            right={m.manager_role ? <Badge label={m.manager_role === 'MANAGER' ? 'Manager' : 'Assistant'} tone="primary" /> : undefined}
            onPress={() => setSelected(m)}
          />
        ))}
      </Card>

      <MemberSheet
        member={selected}
        onClose={() => setSelected(null)}
        actor={actor}
        positionOptions={positionOptions}
        reload={async () => {
          await reload();
          await teams.reload();
        }}
      />
    </>
  );
}

function JoinRequest({ member, positionOptions, reload }: { member: TeamMember; positionOptions: { value: string; label: string }[]; reload: () => Promise<void> }) {
  const requested = member.requested_position?.trim().toLowerCase();
  const [positionId, setPositionId] = useState<string | null>(positionOptions.find((o) => o.label.toLowerCase() === requested)?.value ?? null);
  const [role, setRole] = useState<RosterRole>('ROSTER');
  const { busy, error, setError, run } = useAction();

  const approve = () =>
    run(async () => {
      if (!positionId) return setError('Choose the Team Position for this player.');
      await api('approveMember', { membershipId: member.id, positionId, rosterRole: role });
      await reload();
    });
  const decline = () =>
    run(async () => {
      await api('declineMember', { membershipId: member.id });
      await reload();
    });

  return (
    <Card>
      <Text style={font.heading}>{member.display_name}</Text>
      <Text style={font.small}>{member.requested_position ? `Preferred Position: ${member.requested_position}` : 'No preferred Position given.'}</Text>
      <View style={{ gap: space.sm }}>
        <Text style={font.label}>Team Position</Text>
        <Chips options={positionOptions} value={positionId} onChange={setPositionId} />
      </View>
      <View style={{ gap: space.sm }}>
        <Text style={font.label}>Role</Text>
        <Chips options={ROLE_OPTIONS} value={role} onChange={setRole} />
      </View>
      <ErrorText error={error} />
      <ButtonRow>
        <Button label="Decline" variant="danger" disabled={busy} onPress={() => void decline()} style={{ flex: 1 }} />
        <Button label="Approve" busy={busy} onPress={() => void approve()} style={{ flex: 1 }} />
      </ButtonRow>
    </Card>
  );
}

function MemberSheet({
  member,
  onClose,
  actor,
  positionOptions,
  reload,
}: {
  member: TeamMember | null;
  onClose: () => void;
  actor: { userId: string; role: TeamMember['manager_role'] };
  positionOptions: { value: string; label: string }[];
  reload: () => Promise<void>;
}) {
  const { busy, error, setError, run } = useAction();
  // Confirmation happens inside the sheet: stacking a second modal is unreliable on iOS.
  const [confirming, setConfirming] = useState<'transfer' | 'remove' | null>(null);
  if (!member) return null;
  const target = { userId: member.user_id, role: member.manager_role };

  const close = () => {
    setConfirming(null);
    setError(null);
    onClose();
  };
  const exec = (fn: () => Promise<unknown>) =>
    run(async () => {
      await fn();
      await reload();
      close();
    });

  if (confirming) {
    const transfer = confirming === 'transfer';
    return (
      <Sheet visible onClose={close} title={transfer ? `Make ${member.display_name} the Team Manager?` : `Remove ${member.display_name}?`}>
        {/* No attendance statistics are shown during removal (spec §53). */}
        <Text style={font.body}>
          {transfer ? 'You become an Assistant Manager.' : 'They are taken off the Team and its upcoming Events. Past records are kept.'}
        </Text>
        <ErrorText error={error} />
        <ButtonRow>
          <Button label="Cancel" variant="secondary" onPress={() => setConfirming(null)} style={{ flex: 1 }} />
          <Button
            label={transfer ? 'Transfer' : 'Remove'}
            variant={transfer ? 'primary' : 'danger'}
            busy={busy}
            onPress={() => void exec(() => api(transfer ? 'transferManager' : 'removeMember', { membershipId: member.id }))}
            style={{ flex: 1 }}
          />
        </ButtonRow>
      </Sheet>
    );
  }

  return (
    <Sheet visible onClose={close} title={member.display_name}>
      <View style={{ gap: space.sm }}>
        <Text style={font.label}>Team Position</Text>
        <Chips
          options={positionOptions}
          value={member.position_id}
          onChange={(positionId) => void exec(() => api('setMemberPosition', { membershipId: member.id, positionId }))}
        />
        {member.requested_position ? <Text style={font.small}>Their preference: {member.requested_position}</Text> : null}
      </View>
      <View style={{ gap: space.sm }}>
        <Text style={font.label}>Role</Text>
        <Chips options={ROLE_OPTIONS} value={member.roster_role} onChange={(rosterRole) => void exec(() => api('setMemberRosterRole', { membershipId: member.id, rosterRole }))} />
        <Text style={font.small}>Role changes apply to new Events. Existing Event rosters stay as they are.</Text>
      </View>
      {canAssignAssistant(actor, target) && (
        <Button label="Make Assistant Manager" variant="secondary" busy={busy} onPress={() => void exec(() => api('assignAssistant', { membershipId: member.id }))} />
      )}
      {canRemoveAssistantRole(actor, target) && (
        <Button label="Remove Assistant Role" variant="secondary" busy={busy} onPress={() => void exec(() => api('removeAssistant', { membershipId: member.id }))} />
      )}
      {isTeamManager(actor) && member.user_id !== actor.userId && <Button label="Make Team Manager" variant="secondary" onPress={() => setConfirming('transfer')} />}
      {canRemoveMember(actor, target) && member.user_id !== actor.userId && <Button label="Remove from Team" variant="danger" onPress={() => setConfirming('remove')} />}
      <ErrorText error={error} />
    </Sheet>
  );
}
