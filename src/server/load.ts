// Loaders that turn rows into domain shapes. Commands lock the Team or Event row they change so
// concurrent requests (e.g. two pending players racing for one spot) apply one at a time.
import {
  DomainError,
  type Actor,
  type CallupMode,
  type CallupSelectionMethod,
  type EventRosterEntry,
  type EventType,
  type ManagerRole,
  type PositionConfig,
  type RosterRequirement,
  type TeamAttendanceSettings,
  type TeamPosition,
} from '../domain/index.ts';
import type { EventSummary } from '../domain/notifications.ts';
import { forbidden, notFound, type Tx } from './db.ts';

export interface TeamRow {
  id: string;
  name: string;
  timezone: string;
  arena: string | null;
  default_location: string | null;
  attendance_mode: 'AUTOMATIC' | 'MANUAL';
  release_days_before: number;
  release_time: string;
  reminder_enabled: boolean;
  reminder_hours_before: number;
  callup_mode: CallupMode;
  callup_selection_method: CallupSelectionMethod;
  goalie_enabled: boolean;
  join_code: string;
  accent_color: string | null;
  logo_path: string | null;
}

export async function loadTeam(tx: Tx, teamId: string, lock = false): Promise<TeamRow> {
  const rows = lock
    ? await tx<TeamRow[]>`select * from public.teams where id = ${teamId} and deleted_at is null for update`
    : await tx<TeamRow[]>`select * from public.teams where id = ${teamId} and deleted_at is null`;
  if (!rows.length) throw notFound('Team');
  return { ...rows[0], release_time: rows[0].release_time.slice(0, 5) };
}

export function attendanceSettings(team: TeamRow): TeamAttendanceSettings {
  return {
    timezone: team.timezone,
    attendanceMode: team.attendance_mode,
    releaseDaysBefore: team.release_days_before,
    releaseTime: team.release_time,
    reminderEnabled: team.reminder_enabled,
    reminderHoursBefore: team.reminder_hours_before,
  };
}

export interface MembershipRow {
  id: string;
  team_id: string;
  user_id: string;
  status: 'PENDING' | 'ACTIVE' | 'DECLINED' | 'REMOVED';
  manager_role: ManagerRole | null;
  roster_role: 'ROSTER' | 'CALLUP' | 'NONE';
  requested_position: string | null;
}

export async function loadMembershipById(tx: Tx, membershipId: string): Promise<MembershipRow> {
  const rows = await tx<MembershipRow[]>`select * from public.team_memberships where id = ${membershipId}`;
  if (!rows.length) throw notFound('Member');
  return rows[0];
}

/** The acting user's role on a Team. Throws unless they are an active member. */
export async function requireActor(tx: Tx, teamId: string, userId: string): Promise<Actor> {
  const rows = await tx<{ manager_role: ManagerRole | null }[]>`
    select manager_role from public.team_memberships
    where team_id = ${teamId} and user_id = ${userId} and status = 'ACTIVE'
  `;
  if (!rows.length) throw forbidden('You are not a member of this Team.');
  return { userId, role: rows[0].manager_role };
}

export async function requireManager(tx: Tx, teamId: string, userId: string): Promise<Actor> {
  const actor = await requireActor(tx, teamId, userId);
  if (!actor.role) throw forbidden('Only Managers can do this.');
  return actor;
}

export async function loadPositions(tx: Tx, teamId: string): Promise<TeamPosition[]> {
  const rows = await tx<{ id: string; name: string; kind: TeamPosition['kind']; sort_order: number; components: string[] | null }[]>`
    select p.id, p.name, p.kind, p.sort_order,
           array_remove(array_agg(c.component_id), null) as components
    from public.team_positions p
    left join public.hybrid_position_components c on c.hybrid_id = p.id
    where p.team_id = ${teamId}
    group by p.id
    order by p.sort_order, p.created_at
  `;
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, sortOrder: r.sort_order, componentIds: r.components ?? [] }));
}

export async function loadPositionConfig(tx: Tx, team: TeamRow): Promise<PositionConfig> {
  return { positions: await loadPositions(tx, team.id), goalieEnabled: team.goalie_enabled };
}

export interface EventRow {
  id: string;
  team_id: string;
  type: EventType;
  name: string | null;
  opponent: string | null;
  location: string | null;
  notes: string | null;
  starts_at: Date;
  release_state: 'UNSENT' | 'SCHEDULED' | 'RELEASED';
  release_at: Date | null;
  release_action: 'RELEASE' | 'NOTIFY_MANAGER' | null;
  attendance_round: number;
}

export async function loadEvent(tx: Tx, eventId: string, lock = false): Promise<EventRow> {
  const rows = lock
    ? await tx<EventRow[]>`select * from public.events where id = ${eventId} for update`
    : await tx<EventRow[]>`select * from public.events where id = ${eventId}`;
  if (!rows.length) throw notFound('Event');
  return rows[0];
}

export function eventSummary(event: EventRow, team: TeamRow): EventSummary {
  return { type: event.type, name: event.name, opponent: event.opponent, startsAt: event.starts_at, timezone: team.timezone };
}

export interface EventContext {
  event: EventRow;
  team: TeamRow;
  config: PositionConfig;
  requirements: RosterRequirement[];
  roster: EventRosterEntry[];
  /** Open callup invitations: userId → internal target Position (null = any skater). */
  callupTargets: Map<string, string | null>;
}

export async function loadEventRoster(tx: Tx, eventId: string): Promise<EventRosterEntry[]> {
  const rows = await tx<
    {
      user_id: string;
      display_name: string;
      source: EventRosterEntry['source'];
      position_id: string | null;
      response: EventRosterEntry['response'];
      response_origin: EventRosterEntry['responseOrigin'];
      reason: string | null;
      pending_since: Date | null;
    }[]
  >`
    select rp.user_id, pr.display_name, rp.source, pos.team_position_id as position_id,
           rp.response, rp.response_origin, rp.reason, rp.pending_since
    from public.event_roster_players rp
    join public.profiles pr on pr.id = rp.user_id
    left join public.event_roster_positions pos on pos.roster_player_id = rp.id
    where rp.event_id = ${eventId} and rp.removed_at is null
    order by rp.added_at, rp.id
  `;
  return rows.map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    source: r.source,
    positionId: r.position_id,
    response: r.response,
    responseOrigin: r.response_origin,
    reason: r.reason,
    pendingSince: r.pending_since ? r.pending_since.toISOString() : null,
  }));
}

/** Loads (and optionally locks) an Event with everything the attendance and callup rules need. */
export async function loadEventContext(tx: Tx, eventId: string, lock = true): Promise<EventContext> {
  const event = await loadEvent(tx, eventId, lock);
  const team = await loadTeam(tx, event.team_id);
  const config = await loadPositionConfig(tx, team);
  const requirements = (
    await tx<{ team_position_id: string; quantity: number }[]>`
      select team_position_id, quantity from public.event_roster_requirements where event_id = ${eventId}
    `
  ).map((r) => ({ positionId: r.team_position_id, quantity: r.quantity }));
  const roster = await loadEventRoster(tx, eventId);
  const targets = await tx<{ user_id: string; target_position_id: string | null }[]>`
    select user_id, target_position_id from public.callup_invitations
    where event_id = ${eventId} and closed_at is null and response <> 'NO'
      and attendance_round = ${event.attendance_round}
  `;
  return {
    event,
    team,
    config,
    requirements,
    roster,
    callupTargets: new Map(targets.map((t) => [t.user_id, t.target_position_id])),
  };
}

export async function teamManagerIds(tx: Tx, teamId: string): Promise<string[]> {
  const rows = await tx<{ user_id: string }[]>`
    select user_id from public.team_memberships
    where team_id = ${teamId} and status = 'ACTIVE' and manager_role is not null
  `;
  return rows.map((r) => r.user_id);
}

/** Users (of the given set) whose unavailable dates cover the Event's Team-local date. */
export async function unavailableUsers(tx: Tx, userIds: string[], event: EventRow, team: TeamRow): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const rows = await tx<{ user_id: string }[]>`
    select distinct user_id from public.availability_blocks
    where user_id in ${tx(userIds)}
      and (${event.starts_at} at time zone ${team.timezone})::date between start_date and end_date
  `;
  return new Set(rows.map((r) => r.user_id));
}

export function assertReleased(event: EventRow): void {
  if (event.release_state !== 'RELEASED') {
    throw new DomainError('ATTENDANCE_NOT_RELEASED', 'Attendance has not been sent for this Event yet.');
  }
}
