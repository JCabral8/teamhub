// Read-side queries. Reads go straight to Postgres through row-level security; writes go through `api`.
import type {
  AttendanceMode,
  AttendanceResponse,
  CallupMode,
  CallupSelectionMethod,
  EventRosterEntry,
  EventType,
  ManagerRole,
  PositionConfig,
  RosterRequirement,
  RosterRole,
  TeamPosition,
} from '../domain/index.ts';
import { supabase } from './supabase';

export interface Team {
  id: string;
  name: string;
  timezone: string;
  arena: string | null;
  default_location: string | null;
  join_code: string;
  attendance_mode: AttendanceMode;
  release_days_before: number;
  release_time: string;
  reminder_enabled: boolean;
  reminder_hours_before: number;
  callup_mode: CallupMode;
  callup_selection_method: CallupSelectionMethod;
  goalie_enabled: boolean;
}

export interface MyMembership {
  id: string;
  status: 'ACTIVE' | 'PENDING';
  manager_role: ManagerRole | null;
  roster_role: RosterRole;
  team: Team;
}

const TEAM_COLUMNS =
  'id, name, timezone, arena, default_location, join_code, attendance_mode, release_days_before, release_time, reminder_enabled, reminder_hours_before, callup_mode, callup_selection_method, goalie_enabled';

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function loadMyMemberships(userId: string): Promise<MyMembership[]> {
  const rows = check(
    await supabase
      .from('team_memberships')
      .select(`id, status, manager_role, roster_role, team:teams(${TEAM_COLUMNS})`)
      .eq('user_id', userId)
      .in('status', ['ACTIVE', 'PENDING']),
  ) as unknown as (Omit<MyMembership, 'team'> & { team: Team | null })[];
  return rows
    .filter((r): r is MyMembership => !!r.team)
    .map((r) => ({ ...r, team: { ...r.team, release_time: r.team.release_time.slice(0, 5) } }))
    .sort((a, b) => a.team.name.localeCompare(b.team.name));
}

export interface TeamMember {
  id: string;
  user_id: string;
  status: 'PENDING' | 'ACTIVE';
  manager_role: ManagerRole | null;
  roster_role: RosterRole;
  requested_position: string | null;
  display_name: string;
  /** Official Position; only loaded for Managers. */
  position_id: string | null;
}

export interface TeamDetail {
  positions: TeamPosition[];
  config: PositionConfig;
  requirements: RosterRequirement[];
  members: TeamMember[];
}

export async function loadTeamDetail(team: Team, isManager: boolean): Promise<TeamDetail> {
  const positionRows = check(
    await supabase
      .from('team_positions')
      .select('id, name, kind, sort_order, components:hybrid_position_components!hybrid_position_components_hybrid_id_fkey(component_id)')
      .eq('team_id', team.id)
      .order('sort_order'),
  ) as unknown as { id: string; name: string; kind: TeamPosition['kind']; sort_order: number; components: { component_id: string }[] }[];
  const positions: TeamPosition[] = positionRows.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    sortOrder: p.sort_order,
    componentIds: p.components.map((c) => c.component_id),
  }));
  const requirements = (
    check(await supabase.from('default_roster_requirements').select('team_position_id, quantity').eq('team_id', team.id)) as {
      team_position_id: string;
      quantity: number;
    }[]
  ).map((r) => ({ positionId: r.team_position_id, quantity: r.quantity }));

  const memberRows = check(
    await supabase
      .from('team_memberships')
      .select('id, user_id, status, manager_role, roster_role, requested_position, profile:profiles(display_name)')
      .eq('team_id', team.id)
      .in('status', isManager ? ['ACTIVE', 'PENDING'] : ['ACTIVE']),
  ) as unknown as (Omit<TeamMember, 'display_name' | 'position_id'> & { profile: { display_name: string } | null })[];

  let positionsByMember = new Map<string, string>();
  if (isManager && memberRows.length) {
    const mp = check(
      await supabase.from('member_positions').select('membership_id, team_position_id').in('membership_id', memberRows.map((m) => m.id)),
    ) as { membership_id: string; team_position_id: string }[];
    positionsByMember = new Map(mp.map((r) => [r.membership_id, r.team_position_id]));
  }
  const members = memberRows
    .map((m) => ({ ...m, display_name: m.profile?.display_name ?? 'Player', position_id: positionsByMember.get(m.id) ?? null }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  return { positions, config: { positions, goalieEnabled: team.goalie_enabled }, requirements, members };
}

export interface TeamEvent {
  id: string;
  team_id: string;
  type: EventType;
  name: string | null;
  opponent: string | null;
  location: string | null;
  notes: string | null;
  starts_at: string;
  release_state: 'UNSENT' | 'SCHEDULED' | 'RELEASED';
  release_at: string | null;
  release_action: 'RELEASE' | 'NOTIFY_MANAGER' | null;
}

const EVENT_COLUMNS = 'id, team_id, type, name, opponent, location, notes, starts_at, release_state, release_at, release_action';

export async function loadEvents(teamIds: string[], range: { from?: Date; to?: Date } = {}): Promise<TeamEvent[]> {
  if (!teamIds.length) return [];
  let q = supabase.from('events').select(EVENT_COLUMNS).in('team_id', teamIds).order('starts_at');
  if (range.from) q = q.gte('starts_at', range.from.toISOString());
  if (range.to) q = q.lt('starts_at', range.to.toISOString());
  return check(await q) as TeamEvent[];
}

export interface MyRosterLine {
  event_id: string;
  response: AttendanceResponse;
  pending_since: string | null;
}

/** The signed-in player's own lines on Event rosters. Carries no callup marking (invariant 15). */
export async function loadMyRosterLines(userId: string, eventIds: string[]): Promise<Map<string, MyRosterLine>> {
  if (!eventIds.length) return new Map();
  const rows = check(
    await supabase
      .from('event_roster_players')
      .select('event_id, response, pending_since')
      .eq('user_id', userId)
      .is('removed_at', null)
      .in('event_id', eventIds),
  ) as MyRosterLine[];
  return new Map(rows.map((r) => [r.event_id, r]));
}

export interface CallupInvite {
  user_id: string;
  target_position_id: string | null;
  pool_key: string;
  rank: number;
  response: AttendanceResponse;
  closed_at: string | null;
}

export interface EventDetail {
  event: TeamEvent;
  requirements: RosterRequirement[];
  roster: EventRosterEntry[];
  /** Manager-only: callup invitations with rank and target. Empty for players. */
  invites: CallupInvite[];
}

/** `managerOf` decides, once the Event's Team is known, whether to load the manager-only planning data. */
export async function loadEventDetail(eventId: string, managerOf: (teamId: string) => boolean): Promise<EventDetail> {
  const event = check(await supabase.from('events').select(EVENT_COLUMNS).eq('id', eventId).single()) as TeamEvent;
  const isManager = managerOf(event.team_id);
  const requirements = (
    check(await supabase.from('event_roster_requirements').select('team_position_id, quantity').eq('event_id', eventId)) as {
      team_position_id: string;
      quantity: number;
    }[]
  ).map((r) => ({ positionId: r.team_position_id, quantity: r.quantity }));
  const rows = check(
    await supabase
      .from('event_roster_players')
      .select('id, user_id, response, response_origin, reason, pending_since, profile:profiles(display_name)')
      .eq('event_id', eventId)
      .is('removed_at', null),
  ) as unknown as {
    id: string;
    user_id: string;
    response: AttendanceResponse;
    response_origin: EventRosterEntry['responseOrigin'];
    reason: string | null;
    pending_since: string | null;
    profile: { display_name: string } | null;
  }[];

  let positions = new Map<string, string>();
  let invites: CallupInvite[] = [];
  if (isManager) {
    if (rows.length) {
      const pos = check(
        await supabase.from('event_roster_positions').select('roster_player_id, team_position_id').in('roster_player_id', rows.map((r) => r.id)),
      ) as { roster_player_id: string; team_position_id: string }[];
      positions = new Map(pos.map((p) => [p.roster_player_id, p.team_position_id]));
    }
    invites = check(
      await supabase
        .from('callup_invitations')
        .select('user_id, target_position_id, pool_key, rank, response, closed_at')
        .eq('event_id', eventId)
        .order('invited_at'),
    ) as CallupInvite[];
  }
  const callupIds = new Set(invites.map((i) => i.user_id));
  const roster: EventRosterEntry[] = rows.map((r) => ({
    userId: r.user_id,
    displayName: r.profile?.display_name ?? 'Player',
    // Players cannot read the source; only Managers can tell callups apart, through invitations.
    source: callupIds.has(r.user_id) ? 'CALLUP' : 'ROSTER',
    positionId: positions.get(r.id) ?? null,
    response: r.response,
    responseOrigin: r.response_origin,
    reason: r.reason,
    pendingSince: r.pending_since,
  }));
  return { event, requirements, roster, invites };
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  event_id: string | null;
  created_at: string;
  read_at: string | null;
}

export async function loadNotifications(limit = 30): Promise<AppNotification[]> {
  return check(
    await supabase.from('notifications').select('id, type, title, body, event_id, created_at, read_at').order('created_at', { ascending: false }).limit(limit),
  ) as AppNotification[];
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  check(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids));
}

export interface AvailabilityBlock {
  id: string;
  start_date: string;
  end_date: string;
}

export async function loadAvailability(): Promise<AvailabilityBlock[]> {
  return check(await supabase.from('availability_blocks').select('id, start_date, end_date').order('start_date')) as AvailabilityBlock[];
}

export async function markUnavailable(date: string): Promise<void> {
  check(await supabase.from('availability_blocks').insert({ start_date: date, end_date: date }));
}

export async function clearUnavailable(id: string): Promise<void> {
  check(await supabase.from('availability_blocks').delete().eq('id', id));
}

export interface Profile {
  id: string;
  display_name: string;
  preferred_position: string | null;
}

export async function loadProfile(userId: string): Promise<Profile> {
  return check(await supabase.from('profiles').select('id, display_name, preferred_position').eq('id', userId).single()) as Profile;
}

export async function saveProfile(userId: string, patch: { display_name: string; preferred_position: string | null }): Promise<void> {
  check(await supabase.from('profiles').update(patch).eq('id', userId));
}

/** Manager-only saved callup order per pool (spec §40). */
export async function loadCallupPoolOrder(teamId: string): Promise<Record<string, string[]>> {
  const rows = check(
    await supabase.from('callup_pool_entries').select('pool_key, user_id, rank').eq('team_id', teamId).order('rank'),
  ) as { pool_key: string; user_id: string; rank: number }[];
  const order: Record<string, string[]> = {};
  for (const r of rows) (order[r.pool_key] ??= []).push(r.user_id);
  return order;
}
