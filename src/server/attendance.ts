// AttendanceService, RosterService and CallupService: the server side of spec §25–§50.
import {
  DomainError,
  addWithoutAttendanceRequest,
  processAttendanceChange,
  processCallupSelection,
  processPendingRoster,
  releaseAttendance,
  scheduleAttendance as validateSchedule,
  type AttendanceAnswer,
  type AttendanceNotice,
  type CallupMember,
  type EventAttendanceState,
  type EventRosterEntry,
  type SavedPoolOrder,
} from '../domain/index.ts';
import * as N from '../domain/notifications.ts';
import { audit, notFound, type CommandContext, type Tx } from './db.ts';
import {
  assertReleased,
  eventSummary,
  loadEventContext,
  requireActor,
  requireManager,
  teamManagerIds,
  unavailableUsers,
  type EventContext,
} from './load.ts';
import { notify, toMany, type OutgoingNotification } from './notify.ts';

export function attendanceState(ec: EventContext): EventAttendanceState {
  return {
    released: ec.event.release_state === 'RELEASED',
    requirements: ec.requirements,
    config: ec.config,
    mode: ec.team.callup_mode,
    roster: ec.roster,
    callupTargets: ec.callupTargets,
  };
}

export async function saveRosterUpdates(tx: Tx, eventId: string, updates: EventRosterEntry[], now: Date): Promise<void> {
  for (const u of updates) {
    await tx`
      update public.event_roster_players
      set response = ${u.response}, response_origin = ${u.responseOrigin}, reason = ${u.reason},
          pending_since = ${u.pendingSince}, responded_at = ${now}
      where event_id = ${eventId} and user_id = ${u.userId} and removed_at is null
    `;
  }
}

async function deliverNotices(tx: Tx, ec: EventContext, notices: AttendanceNotice[]): Promise<void> {
  if (!notices.length) return;
  const summary = eventSummary(ec.event, ec.team);
  const managers = await teamManagerIds(tx, ec.team.id);
  const name = (id: string) => ec.roster.find((e) => e.userId === id)?.displayName ?? 'A player';
  const out: OutgoingNotification[] = [];
  for (const n of notices) {
    switch (n.kind) {
      case 'PENDING_APPROVAL':
        out.push({ userId: n.userId, teamId: ec.team.id, eventId: ec.event.id, content: N.pendingApproval(summary) });
        break;
      case 'ROSTER_SPOT_CONFIRMED':
        out.push({ userId: n.userId, teamId: ec.team.id, eventId: ec.event.id, content: N.rosterSpotConfirmed(summary) });
        break;
      case 'ROSTER_DISCREPANCY':
        out.push(...toMany(managers, ec.team.id, ec.event.id, N.attendanceDiscrepancy(summary, name(n.userId))));
        break;
      case 'CALLUP_ACCEPTED':
        out.push(...toMany(managers, ec.team.id, ec.event.id, N.callupAccepted(summary, name(n.userId))));
        break;
      case 'CALLUP_DECLINED':
        out.push(...toMany(managers, ec.team.id, ec.event.id, N.callupDeclined(summary, name(n.userId))));
        break;
    }
  }
  await notify(tx, out);
}

/**
 * Fills legitimate vacancies with callups (spec §50). Runs after every roster-affecting change on a
 * released, upcoming Event. Invitations look exactly like regular Event invitations (spec §46).
 */
export async function selectCallups(
  tx: Tx,
  eventId: string,
  now: Date,
  random: () => number,
  actorId: string | null,
): Promise<string[]> {
  const ec = await loadEventContext(tx, eventId, false);
  if (ec.event.release_state !== 'RELEASED' || ec.event.starts_at.getTime() <= now.getTime()) return [];

  const members = await tx<(CallupMember & { membershipId: string })[]>`
    select m.user_id as "userId", m.id as "membershipId", pr.display_name as "displayName",
           mp.team_position_id as "positionId",
           (select count(*) from public.callup_invitations ci
             where ci.team_id = m.team_id and ci.user_id = m.user_id and ci.response = 'YES')::int as "acceptedCount"
    from public.team_memberships m
    join public.profiles pr on pr.id = m.user_id
    left join public.member_positions mp on mp.membership_id = m.id
    where m.team_id = ${ec.team.id} and m.status = 'ACTIVE' and m.roster_role = 'CALLUP'
  `;
  if (!members.length) return [];
  const savedRows = await tx<{ pool_key: string; user_id: string }[]>`
    select pool_key, user_id from public.callup_pool_entries where team_id = ${ec.team.id} order by pool_key, rank
  `;
  const savedOrder: SavedPoolOrder = {};
  for (const r of savedRows) (savedOrder[r.pool_key] ??= []).push(r.user_id);

  const excluded = await unavailableUsers(tx, members.map((m) => m.userId), ec.event, ec.team);
  const invitedThisRound = await tx<{ user_id: string }[]>`
    select user_id from public.callup_invitations
    where event_id = ${eventId} and attendance_round = ${ec.event.attendance_round}
  `;
  for (const r of invitedThisRound) excluded.add(r.user_id);

  const picks = processCallupSelection({
    ...attendanceState(ec),
    members,
    savedOrder,
    method: ec.team.callup_selection_method,
    unavailableUserIds: excluded,
    random,
  });

  const summary = eventSummary(ec.event, ec.team);
  for (const pick of picks) {
    const member = members.find((m) => m.userId === pick.userId)!;
    const [row] = await tx<{ id: string }[]>`
      insert into public.event_roster_players (event_id, user_id, membership_id, source)
      values (${eventId}, ${pick.userId}, ${member.membershipId}, 'CALLUP')
      on conflict (event_id, user_id) do update set
        source = 'CALLUP', response = 'NO_RESPONSE', response_origin = null, reason = null,
        pending_since = null, responded_at = null, removed_at = null, added_at = ${now}
      returning id
    `;
    await tx`delete from public.event_roster_positions where roster_player_id = ${row.id}`;
    if (member.positionId) {
      await tx`insert into public.event_roster_positions (roster_player_id, team_position_id) values (${row.id}, ${member.positionId})`;
    }
    await tx`
      insert into public.callup_invitations (event_id, team_id, user_id, attendance_round, target_position_id, pool_key, rank, invited_at)
      values (${eventId}, ${ec.team.id}, ${pick.userId}, ${ec.event.attendance_round}, ${pick.targetPositionId}, ${pick.poolKey}, ${pick.rank}, ${now})
    `;
    await notify(tx, [{ userId: pick.userId, teamId: ec.team.id, eventId, content: N.eventInvitation(summary) }]);
    await audit(tx, {
      teamId: ec.team.id,
      eventId,
      actorId,
      action: 'CALLUP_INVITED',
      details: { userId: pick.userId, targetPositionId: pick.targetPositionId, poolKey: pick.poolKey, rank: pick.rank },
    });
  }
  return picks.map((p) => p.userId);
}

/** Promotes pending players into open spots (FCFS) after the roster or its quantities change. */
export async function settleRoster(tx: Tx, eventId: string, now: Date, random: () => number, actorId: string | null): Promise<void> {
  const ec = await loadEventContext(tx, eventId, false);
  if (ec.event.release_state === 'RELEASED') {
    const roster = ec.roster.map((e) => ({ ...e }));
    const promoted = processPendingRoster(roster, attendanceState(ec));
    if (promoted.length) {
      await saveRosterUpdates(tx, eventId, roster.filter((e) => promoted.includes(e.userId)), now);
      await deliverNotices(tx, ec, promoted.map((userId) => ({ kind: 'ROSTER_SPOT_CONFIRMED' as const, userId })));
    }
  }
  await selectCallups(tx, eventId, now, random, actorId);
}

/** Releases attendance now (spec §26, §27 SEND NOW). actorId null means the scheduler released it. */
export async function releaseEventAttendance(tx: Tx, eventId: string, now: Date, random: () => number, actorId: string | null): Promise<void> {
  const ec = await loadEventContext(tx, eventId, true);
  if (ec.event.release_state === 'RELEASED') throw new DomainError('ALREADY_RELEASED', 'Attendance has already been sent.');

  const unavailable = await unavailableUsers(tx, ec.roster.map((e) => e.userId), ec.event, ec.team);
  const { updates, invitees } = releaseAttendance(ec.roster, unavailable);
  await saveRosterUpdates(tx, eventId, updates, now);
  await tx`
    update public.events
    set release_state = 'RELEASED', released_at = ${now}, release_at = null, release_action = null,
        attendance_round = attendance_round + 1, reminder_sent_at = null
    where id = ${eventId}
  `;
  // Callup invitations belong to a round; keep open ones attached to the new round.
  await tx`
    update public.callup_invitations set attendance_round = ${ec.event.attendance_round + 1}
    where event_id = ${eventId} and closed_at is null and attendance_round = ${ec.event.attendance_round}
  `;
  // "Ready to send" notices are done with once attendance is out.
  await tx`
    update public.notifications set read_at = ${now}
    where event_id = ${eventId} and type = 'ATTENDANCE_READY' and read_at is null
  `;
  const summary = eventSummary(ec.event, ec.team);
  await notify(tx, toMany(invitees, ec.team.id, eventId, N.eventInvitation(summary)));
  if (actorId === null) {
    await notify(tx, toMany(await teamManagerIds(tx, ec.team.id), ec.team.id, eventId, N.attendanceSent(summary)));
  }
  await audit(tx, {
    teamId: ec.team.id,
    eventId,
    actorId,
    action: 'ATTENDANCE_SENT',
    details: { invited: invitees.length, autoDeclinedUnavailable: updates.map((u) => u.userId) },
  });
  await settleRoster(tx, eventId, now, random, actorId);
}

// ---------------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------------

async function managerEventContext(ctx: CommandContext, eventId: string): Promise<EventContext> {
  const ec = await loadEventContext(ctx.tx, eventId, true);
  await requireManager(ctx.tx, ec.team.id, ctx.actorId);
  return ec;
}

export async function sendAttendanceNow(ctx: CommandContext, eventId: string): Promise<void> {
  await managerEventContext(ctx, eventId);
  await releaseEventAttendance(ctx.tx, eventId, ctx.now, ctx.random, ctx.actorId);
}

/** SCHEDULE LATER (spec §27). */
export async function scheduleAttendanceLater(ctx: CommandContext, eventId: string, date: string, time: string): Promise<{ releaseAt: string }> {
  const ec = await managerEventContext(ctx, eventId);
  if (ec.event.release_state === 'RELEASED') throw new DomainError('ALREADY_RELEASED', 'Attendance has already been sent.');
  const at = validateSchedule({ date, time }, ctx.now, ec.event.starts_at, ec.team.timezone);
  await ctx.tx`
    update public.events set release_state = 'SCHEDULED', release_at = ${at}, release_action = 'RELEASE'
    where id = ${eventId}
  `;
  await audit(ctx.tx, { teamId: ec.team.id, eventId, actorId: ctx.actorId, action: 'ATTENDANCE_SCHEDULED', details: { releaseAt: at.toISOString() } });
  return { releaseAt: at.toISOString() };
}

/** HOLD OFF (spec §29): nothing is sent until a Manager sends or schedules it. */
export async function holdAttendance(ctx: CommandContext, eventId: string): Promise<void> {
  const ec = await managerEventContext(ctx, eventId);
  if (ec.event.release_state === 'RELEASED') throw new DomainError('ALREADY_RELEASED', 'Attendance has already been sent.');
  await ctx.tx`update public.events set release_state = 'UNSENT', release_at = null, release_action = null where id = ${eventId}`;
  await audit(ctx.tx, { teamId: ec.team.id, eventId, actorId: ctx.actorId, action: 'ATTENDANCE_HELD' });
}

/** A player (or callup) answers YES or NO (spec §31, §32, §37, §48). */
export async function respondAttendance(
  ctx: CommandContext,
  eventId: string,
  answer: AttendanceAnswer,
  reason: string | null,
): Promise<{ standing: 'ATTENDING' | 'PENDING_APPROVAL' | 'NOT_ATTENDING' }> {
  const ec = await loadEventContext(ctx.tx, eventId, true);
  await requireActor(ctx.tx, ec.team.id, ctx.actorId);
  const entry = ec.roster.find((e) => e.userId === ctx.actorId);
  if (!entry) throw new DomainError('NOT_ON_EVENT_ROSTER', 'You are not on this Event roster.');

  const result = processAttendanceChange(attendanceState(ec), ctx.actorId, answer, reason, ctx.now);
  await saveRosterUpdates(ctx.tx, eventId, result.updates, ctx.now);
  // The request has been answered, so it no longer waits in the player's notifications.
  await ctx.tx`
    update public.notifications set read_at = ${ctx.now}
    where user_id = ${ctx.actorId} and event_id = ${eventId} and type = 'EVENT_INVITATION' and read_at is null
  `;
  if (entry.source === 'CALLUP') {
    await ctx.tx`
      update public.callup_invitations set response = ${answer}, responded_at = ${ctx.now}
      where event_id = ${eventId} and user_id = ${ctx.actorId} and closed_at is null
        and attendance_round = ${ec.event.attendance_round}
    `;
  }
  await deliverNotices(ctx.tx, ec, result.notices);
  await audit(ctx.tx, {
    teamId: ec.team.id,
    eventId,
    actorId: ctx.actorId,
    action: entry.source === 'CALLUP' ? (answer === 'YES' ? 'CALLUP_ACCEPTED' : 'CALLUP_DECLINED') : 'ATTENDANCE_CHANGED',
    details: { from: entry.response, to: answer },
  });
  await settleRoster(ctx.tx, eventId, ctx.now, ctx.random, ctx.actorId);

  const mine = result.updates.find((u) => u.userId === ctx.actorId) ?? entry;
  return { standing: mine.response === 'NO' ? 'NOT_ATTENDING' : mine.pendingSince ? 'PENDING_APPROVAL' : 'ATTENDING' };
}

/** Manager adds a player to an Event (spec §49). */
export async function addEventPlayer(
  ctx: CommandContext,
  eventId: string,
  membershipId: string,
  sendRequest: boolean,
): Promise<void> {
  const ec = await managerEventContext(ctx, eventId);
  const [member] = await ctx.tx<{ id: string; user_id: string; display_name: string; position_id: string | null }[]>`
    select m.id, m.user_id, pr.display_name, mp.team_position_id as position_id
    from public.team_memberships m
    join public.profiles pr on pr.id = m.user_id
    left join public.member_positions mp on mp.membership_id = m.id
    where m.id = ${membershipId} and m.team_id = ${ec.team.id} and m.status = 'ACTIVE'
  `;
  if (!member) throw notFound('Member');
  if (ec.roster.some((e) => e.userId === member.user_id)) {
    throw new DomainError('ALREADY_ON_EVENT', 'This player is already on the Event roster.');
  }

  let entry: EventRosterEntry = {
    userId: member.user_id,
    displayName: member.display_name,
    source: 'MANAGER_ADDED',
    positionId: member.position_id,
    response: 'NO_RESPONSE',
    responseOrigin: null,
    reason: null,
    pendingSince: null,
  };
  const released = ec.event.release_state === 'RELEASED';
  if (released && !sendRequest) entry = addWithoutAttendanceRequest(attendanceState(ec), entry);

  const [row] = await ctx.tx<{ id: string }[]>`
    insert into public.event_roster_players (event_id, user_id, membership_id, source, response, response_origin, responded_at)
    values (${eventId}, ${entry.userId}, ${member.id}, 'MANAGER_ADDED', ${entry.response}, ${entry.responseOrigin},
            ${entry.response === 'NO_RESPONSE' ? null : ctx.now})
    on conflict (event_id, user_id) do update set
      source = 'MANAGER_ADDED', response = excluded.response, response_origin = excluded.response_origin,
      reason = null, pending_since = null, responded_at = excluded.responded_at, removed_at = null, added_at = ${ctx.now}
    returning id
  `;
  await ctx.tx`delete from public.event_roster_positions where roster_player_id = ${row.id}`;
  if (entry.positionId) {
    await ctx.tx`insert into public.event_roster_positions (roster_player_id, team_position_id) values (${row.id}, ${entry.positionId})`;
  }
  if (released && sendRequest) {
    await notify(ctx.tx, [{ userId: entry.userId, teamId: ec.team.id, eventId, content: N.eventInvitation(eventSummary(ec.event, ec.team)) }]);
  }
  await audit(ctx.tx, {
    teamId: ec.team.id,
    eventId,
    actorId: ctx.actorId,
    action: 'ROSTER_CHANGED',
    details: { added: entry.userId, attendanceRequest: released ? sendRequest : null },
  });
}

/** Manager removes a player from one Event's roster. */
export async function removeEventPlayer(ctx: CommandContext, eventId: string, userId: string): Promise<void> {
  const ec = await managerEventContext(ctx, eventId);
  if (!ec.roster.some((e) => e.userId === userId)) throw notFound('Player on this Event');
  await removeFromEvent(ctx.tx, eventId, userId, ctx.now, ctx.actorId);
  await audit(ctx.tx, { teamId: ec.team.id, eventId, actorId: ctx.actorId, action: 'ROSTER_CHANGED', details: { removed: userId } });
  await settleRoster(ctx.tx, eventId, ctx.now, ctx.random, ctx.actorId);
}

export async function removeFromEvent(tx: Tx, eventId: string, userId: string, now: Date, actorId: string | null): Promise<void> {
  await tx`update public.event_roster_players set removed_at = ${now}, pending_since = null where event_id = ${eventId} and user_id = ${userId}`;
  await tx`
    update public.callup_invitations set closed_at = ${now}, closed_by = ${actorId}
    where event_id = ${eventId} and user_id = ${userId} and closed_at is null
  `;
}

/** Event roster requirements are independently editable per Event (spec §21). */
export async function setEventRequirements(
  ctx: CommandContext,
  eventId: string,
  requirements: { positionId: string; quantity: number }[],
): Promise<void> {
  const ec = await managerEventContext(ctx, eventId);
  const allowed = new Set(ec.config.positions.filter((p) => p.kind !== 'HYBRID').map((p) => p.id));
  if (requirements.some((r) => !allowed.has(r.positionId))) {
    throw new DomainError('INVALID_REQUIREMENT', 'Requirements apply to base Positions and Goalie only.');
  }
  await ctx.tx`delete from public.event_roster_requirements where event_id = ${eventId}`;
  for (const r of requirements) {
    await ctx.tx`insert into public.event_roster_requirements (event_id, team_position_id, quantity) values (${eventId}, ${r.positionId}, ${r.quantity})`;
  }
  await audit(ctx.tx, { teamId: ec.team.id, eventId, actorId: ctx.actorId, action: 'ROSTER_CHANGED', details: { requirements } });
  await settleRoster(ctx.tx, eventId, ctx.now, ctx.random, ctx.actorId);
}

/** Managers decide when a callup's response window is closed; there is no automatic expiry (spec §48). */
export async function closeCallupInvitation(ctx: CommandContext, eventId: string, userId: string): Promise<void> {
  const ec = await managerEventContext(ctx, eventId);
  const entry = ec.roster.find((e) => e.userId === userId && e.source === 'CALLUP' && e.response === 'NO_RESPONSE');
  if (!entry) throw notFound('Open callup invitation');
  await removeFromEvent(ctx.tx, eventId, userId, ctx.now, ctx.actorId);
  await audit(ctx.tx, { teamId: ec.team.id, eventId, actorId: ctx.actorId, action: 'CALLUP_CLOSED', details: { userId } });
  await settleRoster(ctx.tx, eventId, ctx.now, ctx.random, ctx.actorId);
}

export async function runCallupSelection(ctx: CommandContext, eventId: string): Promise<{ invited: number }> {
  const ec = await managerEventContext(ctx, eventId);
  assertReleased(ec.event);
  return { invited: (await selectCallups(ctx.tx, eventId, ctx.now, ctx.random, ctx.actorId)).length };
}
