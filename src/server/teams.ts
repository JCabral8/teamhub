// MembershipService and PositionService: Teams, join links, approvals, roles, Positions, Default Roster.
import {
  DEFAULT_BASE_POSITIONS,
  DEFAULT_GOALIE_NAME,
  DomainError,
  assertCanLeaveTeam,
  assertManager,
  assertTeamManager,
  canAssignAssistant,
  canRemoveAssistantRole,
  canRemoveMember,
  computeDefaultReleaseAt,
  isValidTimeZone,
  planInitialRelease,
  transferManager as planTransfer,
  validateHybridPosition,
  validatePositionName,
  type AttendanceMode,
  type CallupMode,
  type CallupSelectionMethod,
  type RosterRole,
} from '../domain/index.ts';
import * as N from '../domain/notifications.ts';
import { removeFromEvent, settleRoster } from './attendance.ts';
import { audit, forbidden, notFound, type CommandContext } from './db.ts';
import {
  attendanceSettings,
  loadMembershipById,
  loadPositions,
  loadTeam,
  requireActor,
  requireManager,
  teamManagerIds,
  type MembershipRow,
} from './load.ts';
import { notify, toMany } from './notify.ts';

/** Seeded defaults: Forward, Defence, Forward/Defence, Goalie, and the example hockey roster 1/6/4 (spec §7, §11, §34). */
const DEFAULT_REQUIREMENTS: Record<string, number> = { Goalie: 1, Forward: 6, Defence: 4 };

export interface NewTeam {
  name: string;
  timezone: string;
  arena: string | null;
  defaultLocation: string | null;
  /** Whether the creator plays on the default roster, is a callup, or only manages. */
  rosterRole: RosterRole;
}

export async function createTeam(ctx: CommandContext, input: NewTeam): Promise<{ teamId: string }> {
  if (!isValidTimeZone(input.timezone)) throw new DomainError('INVALID_TIMEZONE', 'Choose a valid timezone.');
  const { tx } = ctx;
  const [team] = await tx<{ id: string }[]>`
    insert into public.teams (name, timezone, arena, default_location, created_by)
    values (${input.name}, ${input.timezone}, ${input.arena}, ${input.defaultLocation}, ${ctx.actorId})
    returning id
  `;
  await tx`
    insert into public.team_memberships (team_id, user_id, status, manager_role, roster_role, approved_at, approved_by)
    values (${team.id}, ${ctx.actorId}, 'ACTIVE', 'MANAGER', ${input.rosterRole}, ${ctx.now}, ${ctx.actorId})
  `;
  const ids: Record<string, string> = {};
  const [g] = await tx<{ id: string }[]>`
    insert into public.team_positions (team_id, name, kind, sort_order) values (${team.id}, ${DEFAULT_GOALIE_NAME}, 'GOALIE', 0) returning id
  `;
  ids[DEFAULT_GOALIE_NAME] = g.id;
  let order = 1;
  for (const name of DEFAULT_BASE_POSITIONS) {
    const [p] = await tx<{ id: string }[]>`
      insert into public.team_positions (team_id, name, kind, sort_order) values (${team.id}, ${name}, 'BASE', ${order++}) returning id
    `;
    ids[name] = p.id;
  }
  const [hybrid] = await tx<{ id: string }[]>`
    insert into public.team_positions (team_id, name, kind, sort_order)
    values (${team.id}, ${DEFAULT_BASE_POSITIONS.join('/')}, 'HYBRID', ${order++}) returning id
  `;
  for (const name of DEFAULT_BASE_POSITIONS) {
    await tx`insert into public.hybrid_position_components (hybrid_id, component_id) values (${hybrid.id}, ${ids[name]})`;
  }
  for (const [name, quantity] of Object.entries(DEFAULT_REQUIREMENTS)) {
    await tx`
      insert into public.default_roster_requirements (team_id, team_position_id, quantity) values (${team.id}, ${ids[name]}, ${quantity})
    `;
  }
  await audit(tx, { teamId: team.id, actorId: ctx.actorId, action: 'TEAM_CREATED' });
  return { teamId: team.id };
}

export interface TeamSettingsPatch {
  name?: string;
  timezone?: string;
  arena?: string | null;
  defaultLocation?: string | null;
  attendanceMode?: AttendanceMode;
  releaseDaysBefore?: number;
  releaseTime?: string;
  reminderEnabled?: boolean;
  reminderHoursBefore?: number;
  callupMode?: CallupMode;
  callupSelectionMethod?: CallupSelectionMethod;
  /** #RRGGBB, or null for the app's default colour. */
  accentColor?: string | null;
  /** Storage path in the team-logos bucket, under the Team's own folder; null removes the logo. */
  logoPath?: string | null;
}

/**
 * Team-specific settings (spec §16). Upcoming Events still on the Team's default release schedule
 * follow the new attendance settings; Events a Manager scheduled by hand keep their time.
 */
export async function updateTeamSettings(ctx: CommandContext, teamId: string, patch: TeamSettingsPatch): Promise<void> {
  const before = await loadTeam(ctx.tx, teamId, true);
  await requireManager(ctx.tx, teamId, ctx.actorId);
  if (patch.timezone !== undefined && !isValidTimeZone(patch.timezone)) {
    throw new DomainError('INVALID_TIMEZONE', 'Choose a valid timezone.');
  }
  if (patch.logoPath && !new RegExp(`^${teamId}/[A-Za-z0-9._-]{1,100}$`).test(patch.logoPath)) {
    throw new DomainError('INVALID_INPUT', "logoPath must be a file in the Team's logo folder.");
  }
  await ctx.tx`
    update public.teams set
      name = ${patch.name ?? before.name},
      timezone = ${patch.timezone ?? before.timezone},
      arena = ${patch.arena !== undefined ? patch.arena : before.arena},
      default_location = ${patch.defaultLocation !== undefined ? patch.defaultLocation : before.default_location},
      attendance_mode = ${patch.attendanceMode ?? before.attendance_mode},
      release_days_before = ${patch.releaseDaysBefore ?? before.release_days_before},
      release_time = ${patch.releaseTime ?? before.release_time},
      reminder_enabled = ${patch.reminderEnabled ?? before.reminder_enabled},
      reminder_hours_before = ${patch.reminderHoursBefore ?? before.reminder_hours_before},
      callup_mode = ${patch.callupMode ?? before.callup_mode},
      callup_selection_method = ${patch.callupSelectionMethod ?? before.callup_selection_method},
      accent_color = ${patch.accentColor !== undefined ? patch.accentColor : before.accent_color},
      logo_path = ${patch.logoPath !== undefined ? patch.logoPath : before.logo_path}
    where id = ${teamId}
  `;
  const after = await loadTeam(ctx.tx, teamId);
  const oldSettings = attendanceSettings(before);
  const newSettings = attendanceSettings(after);
  const scheduled = await ctx.tx<{ id: string; starts_at: Date; release_at: Date }[]>`
    select id, starts_at, release_at from public.events
    where team_id = ${teamId} and release_state = 'SCHEDULED' and starts_at > ${ctx.now}
  `;
  for (const e of scheduled) {
    if (e.release_at.getTime() !== computeDefaultReleaseAt(e.starts_at, oldSettings).getTime()) continue;
    const plan = planInitialRelease(e.starts_at, newSettings, ctx.now);
    if (plan.kind === 'SCHEDULED') {
      await ctx.tx`update public.events set release_at = ${plan.at}, release_action = ${plan.action} where id = ${e.id}`;
    } else {
      await ctx.tx`update public.events set release_state = 'UNSENT', release_at = null, release_action = null where id = ${e.id}`;
    }
  }
  await audit(ctx.tx, { teamId, actorId: ctx.actorId, action: 'TEAM_SETTINGS_CHANGED', details: { ...patch } });
}

export async function regenerateJoinCode(ctx: CommandContext, teamId: string): Promise<{ joinCode: string }> {
  await loadTeam(ctx.tx, teamId, true);
  await requireManager(ctx.tx, teamId, ctx.actorId);
  const [row] = await ctx.tx<{ join_code: string }[]>`
    update public.teams set join_code = replace(gen_random_uuid()::text, '-', '') where id = ${teamId} returning join_code
  `;
  await audit(ctx.tx, { teamId, actorId: ctx.actorId, action: 'JOIN_LINK_RESET' });
  return { joinCode: row.join_code };
}

/** A player asks to join through a Team join link (spec §6). Manager approval is always required. */
export async function requestToJoin(ctx: CommandContext, joinCode: string): Promise<{ teamId: string; status: 'PENDING' }> {
  const [team] = await ctx.tx<{ id: string; name: string }[]>`
    select id, name from public.teams where join_code = ${joinCode} and deleted_at is null for update
  `;
  if (!team) throw new DomainError('INVALID_JOIN_LINK', 'This join link is not valid.');
  const [profile] = await ctx.tx<{ display_name: string; preferred_position: string | null }[]>`
    select display_name, preferred_position from public.profiles where id = ${ctx.actorId}
  `;
  const [existing] = await ctx.tx<MembershipRow[]>`
    select * from public.team_memberships where team_id = ${team.id} and user_id = ${ctx.actorId}
  `;
  if (existing?.status === 'ACTIVE') throw new DomainError('ALREADY_MEMBER', 'You are already on this Team.');
  if (existing?.status === 'PENDING') return { teamId: team.id, status: 'PENDING' };
  if (existing) {
    await ctx.tx`
      update public.team_memberships
      set status = 'PENDING', requested_position = ${profile.preferred_position}, requested_at = ${ctx.now},
          approved_at = null, approved_by = null, removed_at = null
      where id = ${existing.id}
    `;
  } else {
    await ctx.tx`
      insert into public.team_memberships (team_id, user_id, status, requested_position, requested_at)
      values (${team.id}, ${ctx.actorId}, 'PENDING', ${profile.preferred_position}, ${ctx.now})
    `;
  }
  await notify(ctx.tx, toMany(await teamManagerIds(ctx.tx, team.id), team.id, null, N.membershipRequest(team.name, profile.display_name)));
  await audit(ctx.tx, { teamId: team.id, actorId: ctx.actorId, action: 'JOIN_REQUESTED' });
  return { teamId: team.id, status: 'PENDING' };
}

async function managedMembership(ctx: CommandContext, membershipId: string) {
  const target = await loadMembershipById(ctx.tx, membershipId);
  await loadTeam(ctx.tx, target.team_id, true);
  const actor = await requireActor(ctx.tx, target.team_id, ctx.actorId);
  return { target, actor };
}

async function assertTeamPosition(ctx: CommandContext, teamId: string, positionId: string): Promise<void> {
  const [p] = await ctx.tx`select 1 from public.team_positions where id = ${positionId} and team_id = ${teamId}`;
  if (!p) throw notFound('Position');
}

/** Manager approves a join request, confirming or changing the player's Position (spec §5). */
export async function approveMember(ctx: CommandContext, membershipId: string, positionId: string, rosterRole: RosterRole): Promise<void> {
  const { target, actor } = await managedMembership(ctx, membershipId);
  assertManager(actor);
  if (target.status !== 'PENDING') throw new DomainError('NOT_PENDING', 'This request has already been handled.');
  await assertTeamPosition(ctx, target.team_id, positionId);
  await ctx.tx`
    update public.team_memberships
    set status = 'ACTIVE', roster_role = ${rosterRole}, approved_at = ${ctx.now}, approved_by = ${ctx.actorId}, removed_at = null
    where id = ${membershipId}
  `;
  await ctx.tx`
    insert into public.member_positions (membership_id, team_position_id, updated_by) values (${membershipId}, ${positionId}, ${ctx.actorId})
    on conflict (membership_id) do update set team_position_id = excluded.team_position_id, updated_by = excluded.updated_by
  `;
  await audit(ctx.tx, { teamId: target.team_id, actorId: ctx.actorId, action: 'PLAYER_JOINED', details: { userId: target.user_id, rosterRole } });
}

export async function declineMember(ctx: CommandContext, membershipId: string): Promise<void> {
  const { target, actor } = await managedMembership(ctx, membershipId);
  assertManager(actor);
  if (target.status !== 'PENDING') throw new DomainError('NOT_PENDING', 'This request has already been handled.');
  await ctx.tx`update public.team_memberships set status = 'DECLINED' where id = ${membershipId}`;
  await audit(ctx.tx, { teamId: target.team_id, actorId: ctx.actorId, action: 'JOIN_DECLINED', details: { userId: target.user_id } });
}

/** Managers set a player's official team Position at any time (spec §5). Existing Events keep their snapshot. */
export async function setMemberPosition(ctx: CommandContext, membershipId: string, positionId: string): Promise<void> {
  const { target, actor } = await managedMembership(ctx, membershipId);
  assertManager(actor);
  if (target.status !== 'ACTIVE') throw notFound('Member');
  await assertTeamPosition(ctx, target.team_id, positionId);
  await ctx.tx`
    insert into public.member_positions (membership_id, team_position_id, updated_by) values (${membershipId}, ${positionId}, ${ctx.actorId})
    on conflict (membership_id) do update set team_position_id = excluded.team_position_id, updated_by = excluded.updated_by
  `;
  await audit(ctx.tx, { teamId: target.team_id, actorId: ctx.actorId, action: 'POSITION_ASSIGNED', details: { userId: target.user_id, positionId } });
}

export async function setMemberRosterRole(ctx: CommandContext, membershipId: string, rosterRole: RosterRole): Promise<void> {
  const { target, actor } = await managedMembership(ctx, membershipId);
  assertManager(actor);
  if (target.status !== 'ACTIVE') throw notFound('Member');
  await ctx.tx`update public.team_memberships set roster_role = ${rosterRole} where id = ${membershipId}`;
  if (rosterRole !== 'CALLUP') {
    await ctx.tx`delete from public.callup_pool_entries where team_id = ${target.team_id} and user_id = ${target.user_id}`;
  }
  await audit(ctx.tx, { teamId: target.team_id, actorId: ctx.actorId, action: 'ROSTER_CHANGED', details: { userId: target.user_id, rosterRole } });
}

/**
 * Removes a player from the Team (spec §52, §53). History stays; they leave upcoming Event rosters and no
 * longer count toward current roster, Position counts, statistics or callups.
 */
export async function removeMember(ctx: CommandContext, membershipId: string): Promise<void> {
  const { target, actor } = await managedMembership(ctx, membershipId);
  if (target.status !== 'ACTIVE') throw notFound('Member');
  if (target.user_id === ctx.actorId) assertCanLeaveTeam(actor);
  if (!canRemoveMember(actor, { userId: target.user_id, role: target.manager_role })) throw forbidden();

  await ctx.tx`
    update public.team_memberships set status = 'REMOVED', manager_role = null, removed_at = ${ctx.now} where id = ${membershipId}
  `;
  await ctx.tx`delete from public.callup_pool_entries where team_id = ${target.team_id} and user_id = ${target.user_id}`;
  const upcoming = await ctx.tx<{ event_id: string }[]>`
    select rp.event_id from public.event_roster_players rp
    join public.events e on e.id = rp.event_id
    where e.team_id = ${target.team_id} and rp.user_id = ${target.user_id} and rp.removed_at is null and e.starts_at > ${ctx.now}
    order by e.starts_at
    for update of e
  `;
  for (const { event_id } of upcoming) {
    await removeFromEvent(ctx.tx, event_id, target.user_id, ctx.now, ctx.actorId);
    await settleRoster(ctx.tx, event_id, ctx.now, ctx.random, ctx.actorId);
  }
  await audit(ctx.tx, { teamId: target.team_id, actorId: ctx.actorId, action: 'PLAYER_REMOVED', details: { userId: target.user_id } });
}

export async function leaveTeam(ctx: CommandContext, teamId: string): Promise<void> {
  const [m] = await ctx.tx<{ id: string }[]>`
    select id from public.team_memberships where team_id = ${teamId} and user_id = ${ctx.actorId} and status = 'ACTIVE'
  `;
  if (!m) throw notFound('Membership');
  await removeMember(ctx, m.id);
}

export async function assignAssistant(ctx: CommandContext, membershipId: string): Promise<void> {
  const { target, actor } = await managedMembership(ctx, membershipId);
  if (target.status !== 'ACTIVE' || !canAssignAssistant(actor, { userId: target.user_id, role: target.manager_role })) throw forbidden();
  await ctx.tx`update public.team_memberships set manager_role = 'ASSISTANT_MANAGER' where id = ${membershipId}`;
  await audit(ctx.tx, { teamId: target.team_id, actorId: ctx.actorId, action: 'MANAGER_CHANGED', details: { assistantAdded: target.user_id } });
}

/** Assistants can remove themselves; only the Team Manager removes other Assistants (spec §56). */
export async function removeAssistant(ctx: CommandContext, membershipId: string): Promise<void> {
  const { target, actor } = await managedMembership(ctx, membershipId);
  if (!canRemoveAssistantRole(actor, { userId: target.user_id, role: target.manager_role })) throw forbidden();
  await ctx.tx`update public.team_memberships set manager_role = null where id = ${membershipId}`;
  await audit(ctx.tx, { teamId: target.team_id, actorId: ctx.actorId, action: 'MANAGER_CHANGED', details: { assistantRemoved: target.user_id } });
}

/** Succession: the previous Manager immediately becomes an Assistant Manager (spec §2). */
export async function transferManager(ctx: CommandContext, membershipId: string): Promise<void> {
  const { target, actor } = await managedMembership(ctx, membershipId);
  if (target.status !== 'ACTIVE') throw notFound('Member');
  const plan = planTransfer(actor, { userId: target.user_id, role: target.manager_role });
  await ctx.tx`
    update public.team_memberships set manager_role = 'ASSISTANT_MANAGER'
    where team_id = ${target.team_id} and user_id = ${plan.previousManager.userId}
  `;
  await ctx.tx`update public.team_memberships set manager_role = 'MANAGER' where id = ${membershipId}`;
  const team = await loadTeam(ctx.tx, target.team_id);
  const [p] = await ctx.tx<{ display_name: string }[]>`select display_name from public.profiles where id = ${target.user_id}`;
  await notify(ctx.tx, toMany(await teamManagerIds(ctx.tx, team.id), team.id, null, N.managerSuccession(team.name, p.display_name)));
  await audit(ctx.tx, { teamId: team.id, actorId: ctx.actorId, action: 'MANAGER_CHANGED', details: { newManager: target.user_id } });
}

export async function deleteTeam(ctx: CommandContext, teamId: string): Promise<void> {
  await loadTeam(ctx.tx, teamId, true);
  assertTeamManager(await requireActor(ctx.tx, teamId, ctx.actorId));
  await ctx.tx`update public.teams set deleted_at = ${ctx.now} where id = ${teamId}`;
  await ctx.tx`update public.events set release_state = 'UNSENT', release_at = null, release_action = null where team_id = ${teamId} and release_state = 'SCHEDULED'`;
  await audit(ctx.tx, { teamId, actorId: ctx.actorId, action: 'TEAM_DELETED' });
}

// ---------------------------------------------------------------------------------------------------
// Positions, Goalie and Default Roster (spec §7–§11)
// ---------------------------------------------------------------------------------------------------

export async function createPosition(ctx: CommandContext, teamId: string, name: string): Promise<{ positionId: string }> {
  await loadTeam(ctx.tx, teamId, true);
  await requireManager(ctx.tx, teamId, ctx.actorId);
  const positions = await loadPositions(ctx.tx, teamId);
  const valid = validatePositionName(name, positions);
  const nextOrder = Math.max(0, ...positions.map((p) => p.sortOrder)) + 1;
  const [p] = await ctx.tx<{ id: string }[]>`
    insert into public.team_positions (team_id, name, kind, sort_order) values (${teamId}, ${valid}, 'BASE', ${nextOrder}) returning id
  `;
  await audit(ctx.tx, { teamId, actorId: ctx.actorId, action: 'POSITION_CREATED', details: { name: valid } });
  return { positionId: p.id };
}

export async function createHybridPosition(ctx: CommandContext, teamId: string, componentIds: string[]): Promise<{ positionId: string; name: string }> {
  await loadTeam(ctx.tx, teamId, true);
  await requireManager(ctx.tx, teamId, ctx.actorId);
  const positions = await loadPositions(ctx.tx, teamId);
  const hybrid = validateHybridPosition(componentIds, positions);
  const nextOrder = Math.max(0, ...positions.map((p) => p.sortOrder)) + 1;
  const [p] = await ctx.tx<{ id: string }[]>`
    insert into public.team_positions (team_id, name, kind, sort_order) values (${teamId}, ${hybrid.name}, 'HYBRID', ${nextOrder}) returning id
  `;
  for (const id of hybrid.componentIds) {
    await ctx.tx`insert into public.hybrid_position_components (hybrid_id, component_id) values (${p.id}, ${id})`;
  }
  await audit(ctx.tx, { teamId, actorId: ctx.actorId, action: 'POSITION_CREATED', details: { name: hybrid.name, hybrid: true } });
  return { positionId: p.id, name: hybrid.name };
}

/** Enable, disable or rename the single special Goalie Position (spec §8). */
export async function configureGoalie(ctx: CommandContext, teamId: string, change: { enabled?: boolean; name?: string }): Promise<void> {
  await loadTeam(ctx.tx, teamId, true);
  await requireManager(ctx.tx, teamId, ctx.actorId);
  const positions = await loadPositions(ctx.tx, teamId);
  const goalie = positions.find((p) => p.kind === 'GOALIE');
  if (!goalie) throw notFound('Goalie Position');
  if (change.name !== undefined) {
    const name = validatePositionName(change.name, positions, goalie.id);
    await ctx.tx`update public.team_positions set name = ${name} where id = ${goalie.id}`;
  }
  if (change.enabled !== undefined) {
    await ctx.tx`update public.teams set goalie_enabled = ${change.enabled} where id = ${teamId}`;
  }
  await audit(ctx.tx, { teamId, actorId: ctx.actorId, action: 'GOALIE_CONFIGURED', details: change });
}

/** Deletes a Position nobody uses (no players, hybrids, requirements or Event history reference it). */
export async function deletePosition(ctx: CommandContext, positionId: string): Promise<void> {
  const [pos] = await ctx.tx<{ team_id: string; kind: string }[]>`select team_id, kind from public.team_positions where id = ${positionId}`;
  if (!pos) throw notFound('Position');
  await loadTeam(ctx.tx, pos.team_id, true);
  await requireManager(ctx.tx, pos.team_id, ctx.actorId);
  if (pos.kind === 'GOALIE') throw new DomainError('GOALIE_CANNOT_BE_DELETED', 'Disable the Goalie instead.');
  const [use] = await ctx.tx<{ used: boolean }[]>`
    select exists (select 1 from public.member_positions where team_position_id = ${positionId})
        or exists (select 1 from public.hybrid_position_components where component_id = ${positionId})
        or exists (select 1 from public.event_roster_positions where team_position_id = ${positionId})
        or exists (select 1 from public.event_roster_requirements where team_position_id = ${positionId})
        or exists (select 1 from public.callup_invitations where target_position_id = ${positionId}) as used
  `;
  if (use.used) throw new DomainError('POSITION_IN_USE', 'This Position is in use and cannot be deleted.');
  await ctx.tx`delete from public.team_positions where id = ${positionId}`;
  await audit(ctx.tx, { teamId: pos.team_id, actorId: ctx.actorId, action: 'POSITION_DELETED', details: { positionId } });
}

/** Replaces the Team Default Roster quantities. Existing Events are untouched (spec §11, invariant 17). */
export async function setDefaultRoster(ctx: CommandContext, teamId: string, requirements: { positionId: string; quantity: number }[]): Promise<void> {
  await loadTeam(ctx.tx, teamId, true);
  await requireManager(ctx.tx, teamId, ctx.actorId);
  const positions = await loadPositions(ctx.tx, teamId);
  for (const r of requirements) {
    const p = positions.find((x) => x.id === r.positionId);
    if (!p || p.kind === 'HYBRID') throw new DomainError('INVALID_REQUIREMENT', 'Requirements apply to base Positions and Goalie only.');
  }
  await ctx.tx`delete from public.default_roster_requirements where team_id = ${teamId}`;
  for (const r of requirements) {
    await ctx.tx`insert into public.default_roster_requirements (team_id, team_position_id, quantity) values (${teamId}, ${r.positionId}, ${r.quantity})`;
  }
  await audit(ctx.tx, { teamId, actorId: ctx.actorId, action: 'DEFAULT_ROSTER_CHANGED', details: { requirements } });
}

/** Manager-defined callup order for one pool (spec §40). Players never see it. */
export async function setCallupPoolOrder(ctx: CommandContext, teamId: string, poolKey: string, userIds: string[]): Promise<void> {
  await loadTeam(ctx.tx, teamId, true);
  await requireManager(ctx.tx, teamId, ctx.actorId);
  const members = await ctx.tx<{ user_id: string }[]>`
    select user_id from public.team_memberships where team_id = ${teamId} and status = 'ACTIVE' and roster_role = 'CALLUP'
  `;
  const allowed = new Set(members.map((m) => m.user_id));
  if (new Set(userIds).size !== userIds.length || userIds.some((id) => !allowed.has(id))) {
    throw new DomainError('INVALID_POOL_ORDER', 'The order must list callups of this Team once each.');
  }
  await ctx.tx`delete from public.callup_pool_entries where team_id = ${teamId} and pool_key = ${poolKey}`;
  let rank = 1;
  for (const userId of userIds) {
    await ctx.tx`insert into public.callup_pool_entries (team_id, pool_key, user_id, rank) values (${teamId}, ${poolKey}, ${userId}, ${rank++})`;
  }
  await audit(ctx.tx, { teamId, actorId: ctx.actorId, action: 'CALLUP_ORDER_CHANGED', details: { poolKey } });
}
