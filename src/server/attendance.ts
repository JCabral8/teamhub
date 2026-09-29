// AttendanceService, RosterService and CallupService: the server side of spec §25–§50.
import {
  DomainError,
  addWithoutAttendanceRequest,
  assignInviteTargets,
  calculateCallupNeeds,
  decidePending,
  poolKeysFor,
  processAttendanceChange,
  processCallupSelection,
  releaseAttendance,
  scheduleAttendance as validateSchedule,
  setCallupStatus,
  wouldBePending,
  type AttendanceAnswer,
  type AttendanceNotice,
  type CallupMember,
  type CallupSelection,
  type CallupSelectionMethod,
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
    callupSpots: ec.event.callup_spots,
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
      case 'CALLUP_CONFIRMED':
        out.push({ userId: n.userId, teamId: ec.team.id, eventId: ec.event.id, content: N.callupConfirmed(summary) });
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

type CallupCandidate = CallupMember & { membershipId: string; unavailable: boolean; onEvent: boolean };

/**
 * The Team's callups for an Event, and which of them the Team's callup method would pick for the open
 * spots right now (spec §38–§42). Managers see this as a suggestion and decide who to invite
 * (wireframes 3B, 8D); nothing is invited automatically.
 */
export async function planCallups(
  tx: Tx,
  ec: EventContext,
  now: Date,
  random: () => number,
  method: CallupSelectionMethod = ec.team.callup_selection_method,
): Promise<{ candidates: CallupCandidate[]; picks: CallupSelection[] }> {
  const members = await tx<(CallupMember & { membershipId: string })[]>`
    select m.user_id as "userId", m.id as "membershipId", pr.display_name as "displayName",
           mp.team_position_id as "positionId",
           (select count(*) from public.callup_invitations ci
             where ci.team_id = m.team_id and ci.user_id = m.user_id and ci.response = 'YES')::int as "acceptedCount"
    from public.team_memberships m
    join public.profiles pr on pr.id = m.user_id
    left join public.member_positions mp on mp.membership_id = m.id
    where m.team_id = ${ec.team.id} and m.status = 'ACTIVE' and m.roster_role = 'CALLUP'
    order by pr.display_name
  `;
  if (!members.length) return { candidates: [], picks: [] };
  const savedRows = await tx<{ pool_key: string; user_id: string }[]>`
    select pool_key, user_id from public.callup_pool_entries where team_id = ${ec.team.id} order by pool_key, rank
  `;
  const savedOrder: SavedPoolOrder = {};
  for (const r of savedRows) (savedOrder[r.pool_key] ??= []).push(r.user_id);

  const unavailable = await unavailableUsers(tx, members.map((m) => m.userId), ec.event, ec.team);
  const excluded = new Set(unavailable);
  const invitedThisRound = await tx<{ user_id: string }[]>`
    select user_id from public.callup_invitations
    where event_id = ${ec.event.id} and attendance_round = ${ec.event.attendance_round}
  `;
  for (const r of invitedThisRound) excluded.add(r.user_id);

  const upcoming = ec.event.release_state === 'RELEASED' && ec.event.starts_at.getTime() > now.getTime();
  const picks = upcoming
    ? processCallupSelection({ ...attendanceState(ec), members, savedOrder, method, unavailableUserIds: excluded, random })
    : [];
  // A callup who declined can be asked again; anyone else already on the Event can't.
  const onEvent = new Set(ec.roster.filter((e) => !(e.source === 'CALLUP' && e.response === 'NO')).map((e) => e.userId));
  return {
    candidates: members.map((m) => ({ ...m, unavailable: unavailable.has(m.userId), onEvent: onEvent.has(m.userId) })),
    picks,
  };
}

/** Puts the chosen callups on the Event and sends each a callup invitation (wireframe 7A). */
async function inviteCallupUsers(
  tx: Tx,
  ec: EventContext,
  userIds: string[],
  plan: { candidates: CallupCandidate[]; picks: CallupSelection[] },
  targets: ReadonlyMap<string, string | null>,
  now: Date,
  actorId: string | null,
): Promise<number> {
  const summary = eventSummary(ec.event, ec.team);
  let invited = 0;
  for (const userId of [...new Set(userIds)]) {
    const member = plan.candidates.find((m) => m.userId === userId);
    if (!member) throw new DomainError('NOT_A_CALLUP', 'Only players on the Team callup list can be invited as callups.');
    const current = ec.roster.find((e) => e.userId === userId);
    if (current && (current.source !== 'CALLUP' || current.response !== 'NO')) {
      throw new DomainError('ALREADY_ON_EVENT', `${member.displayName} is already on this Event.`);
    }
    const pick = plan.picks.find((p) => p.userId === userId);
    const poolKey = pick?.poolKey ?? poolKeysFor(member.positionId, ec.config, ec.team.callup_mode)[0];
    const rank = pick?.rank ?? 1;
    const target = targets.get(userId) ?? null;
    const [row] = await tx<{ id: string }[]>`
      insert into public.event_roster_players (event_id, user_id, membership_id, source)
      values (${ec.event.id}, ${userId}, ${member.membershipId}, 'CALLUP')
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
      update public.callup_invitations set closed_at = ${now}, closed_by = ${actorId}
      where event_id = ${ec.event.id} and user_id = ${userId} and closed_at is null
    `;
    await tx`
      insert into public.callup_invitations (event_id, team_id, user_id, attendance_round, target_position_id, pool_key, rank, invited_at)
      values (${ec.event.id}, ${ec.team.id}, ${userId}, ${ec.event.attendance_round}, ${target}, ${poolKey}, ${rank}, ${now})
    `;
    await notify(tx, [{ userId, teamId: ec.team.id, eventId: ec.event.id, content: N.callupInvitation(summary) }]);
    await audit(tx, {
      teamId: ec.team.id,
      eventId: ec.event.id,
      actorId,
      action: 'CALLUP_INVITED',
      details: { userId, targetPositionId: target, poolKey, rank, suggested: !!pick },
    });
    invited++;
  }
  return invited;
}

/** Releases attendance now (spec §26, §27 SEND NOW). actorId null means the scheduler released it. */
export async function releaseEventAttendance(tx: Tx, eventId: string, now: Date, _random: () => number, actorId: string | null): Promise<void> {
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

/** A player (or callup) answers YES, NO or MAYBE (spec §31, §32, §37, §48; wireframes 6, 7). */
export async function respondAttendance(
  ctx: CommandContext,
  eventId: string,
  answer: AttendanceAnswer,
  reason: string | null,
): Promise<{ standing: 'ATTENDING' | 'PENDING_APPROVAL' | 'NOT_ATTENDING' | 'MAYBE' }> {
  const ec = await loadEventContext(ctx.tx, eventId, true);
  await requireActor(ctx.tx, ec.team.id, ctx.actorId);
  const entry = ec.roster.find((e) => e.userId === ctx.actorId);
  if (!entry) throw new DomainError('NOT_ON_EVENT_ROSTER', 'You are not on this Event roster.');

  const result = processAttendanceChange(attendanceState(ec), ctx.actorId, answer, reason, ctx.now);
  await saveRosterUpdates(ctx.tx, eventId, result.updates, ctx.now);
  // The request has been answered, so it no longer waits in the player's notifications.
  await ctx.tx`
    update public.notifications set read_at = ${ctx.now}
    where user_id = ${ctx.actorId} and event_id = ${eventId} and type in ('EVENT_INVITATION', 'CALLUP_INVITATION') and read_at is null
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
    action: entry.source === 'CALLUP' ? `CALLUP_${answer === 'YES' ? 'ACCEPTED' : answer === 'NO' ? 'DECLINED' : 'MAYBE'}` : 'ATTENDANCE_CHANGED',
    details: { from: entry.response, to: answer },
  });

  const mine = result.updates.find((u) => u.userId === ctx.actorId) ?? entry;
  return {
    standing: mine.response === 'NO' ? 'NOT_ATTENDING' : mine.response === 'MAYBE' ? 'MAYBE' : mine.pendingSince ? 'PENDING_APPROVAL' : 'ATTENDING',
  };
}

/** Before a player confirms Yes: would it put them on the waitlist? (wireframe 4A "Roster is full") */
export async function previewAttendance(ctx: CommandContext, eventId: string): Promise<{ rosterFull: boolean }> {
  const ec = await loadEventContext(ctx.tx, eventId, false);
  await requireActor(ctx.tx, ec.team.id, ctx.actorId);
  if (!ec.roster.some((e) => e.userId === ctx.actorId)) throw new DomainError('NOT_ON_EVENT_ROSTER', 'You are not on this Event roster.');
  return { rosterFull: wouldBePending(attendanceState(ec), ctx.actorId) };
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
  const entry = ec.roster.find((e) => e.userId === userId);
  if (!entry) throw notFound('Player on this Event');
  await removeFromEvent(ctx.tx, eventId, userId, ctx.now, ctx.actorId);
  // A callup taken off the list hears that they're no longer needed (wireframe 7).
  if (entry.source === 'CALLUP' && entry.response !== 'NO') {
    await notify(ctx.tx, [{ userId, teamId: ec.team.id, eventId, content: N.callupNoLongerNeeded(eventSummary(ec.event, ec.team)) }]);
  }
  await audit(ctx.tx, { teamId: ec.team.id, eventId, actorId: ctx.actorId, action: 'ROSTER_CHANGED', details: { removed: userId } });
}

export async function removeFromEvent(tx: Tx, eventId: string, userId: string, now: Date, actorId: string | null): Promise<void> {
  await tx`update public.event_roster_players set removed_at = ${now}, pending_since = null where event_id = ${eventId} and user_id = ${userId}`;
  await tx`
    update public.callup_invitations set closed_at = ${now}, closed_by = ${actorId}
    where event_id = ${eventId} and user_id = ${userId} and closed_at is null
  `;
}

/** Event roster requirements and callup spots are independently editable per Event (spec §21, wireframe 2D). */
export async function setEventRequirements(
  ctx: CommandContext,
  eventId: string,
  requirements: { positionId: string; quantity: number }[],
  callupSpots?: number,
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
  if (callupSpots !== undefined) await ctx.tx`update public.events set callup_spots = ${callupSpots} where id = ${eventId}`;
  await audit(ctx.tx, { teamId: ec.team.id, eventId, actorId: ctx.actorId, action: 'ROSTER_CHANGED', details: { requirements, callupSpots } });
}

/** Managers decide when a callup's response window is closed; there is no automatic expiry (spec §48). */
export async function closeCallupInvitation(ctx: CommandContext, eventId: string, userId: string): Promise<void> {
  const ec = await managerEventContext(ctx, eventId);
  const entry = ec.roster.find((e) => e.userId === userId && e.source === 'CALLUP' && (e.response === 'NO_RESPONSE' || e.response === 'MAYBE'));
  if (!entry) throw notFound('Open callup invitation');
  await removeFromEvent(ctx.tx, eventId, userId, ctx.now, ctx.actorId);
  await notify(ctx.tx, [{ userId, teamId: ec.team.id, eventId, content: N.callupNoLongerNeeded(eventSummary(ec.event, ec.team)) }]);
  await audit(ctx.tx, { teamId: ec.team.id, eventId, actorId: ctx.actorId, action: 'CALLUP_CLOSED', details: { userId } });
}

/** The Team's callups for this Event, with the ones the callup method suggests (wireframes 3B, 8D). */
export async function getCallupCandidates(ctx: CommandContext, eventId: string, method?: CallupSelectionMethod) {
  const ec = await managerEventContext(ctx, eventId);
  const plan = await planCallups(ctx.tx, ec, ctx.now, ctx.random, method);
  const order = new Map(plan.picks.map((p, i) => [p.userId, i]));
  const upcoming = ec.event.release_state === 'RELEASED' && ec.event.starts_at.getTime() > ctx.now.getTime();
  return {
    spots: upcoming ? calculateCallupNeeds(ec.roster, attendanceState(ec)).reduce((s, n) => s + n.count, 0) : 0,
    candidates: plan.candidates
      .map((c) => ({
        userId: c.userId,
        membershipId: c.membershipId,
        displayName: c.displayName,
        positionId: c.positionId,
        acceptedCount: c.acceptedCount,
        unavailable: c.unavailable,
        onEvent: c.onEvent,
        suggested: order.has(c.userId),
      }))
      // Suggested first in pick order, then everyone else alphabetically.
      .sort((a, b) => (order.get(a.userId) ?? Infinity) - (order.get(b.userId) ?? Infinity) || a.displayName.localeCompare(b.displayName)),
  };
}

/** Invites the callups a Manager picked (wireframes 3B, 8D "Send Invitations"). */
export async function inviteCallups(ctx: CommandContext, eventId: string, userIds: string[]): Promise<{ invited: number }> {
  const ec = await managerEventContext(ctx, eventId);
  assertReleased(ec.event);
  if (!userIds.length) throw new DomainError('INVALID_INPUT', 'Choose at least one callup to invite.');
  const plan = await planCallups(ctx.tx, ec, ctx.now, ctx.random);
  const chosen = [...new Set(userIds)].map((id) => plan.candidates.find((c) => c.userId === id)).filter((c): c is CallupCandidate => !!c);
  const targets = assignInviteTargets(chosen, ec.roster, attendanceState(ec));
  return { invited: await inviteCallupUsers(ctx.tx, ec, userIds, plan, targets, ctx.now, ctx.actorId) };
}

/** Invites exactly the callups the Team's method suggests for the open spots. */
export async function runCallupSelection(ctx: CommandContext, eventId: string): Promise<{ invited: number }> {
  const ec = await managerEventContext(ctx, eventId);
  assertReleased(ec.event);
  const plan = await planCallups(ctx.tx, ec, ctx.now, ctx.random);
  const targets = new Map(plan.picks.map((p) => [p.userId, p.targetPositionId]));
  return { invited: await inviteCallupUsers(ctx.tx, ec, plan.picks.map((p) => p.userId), plan, targets, ctx.now, ctx.actorId) };
}

/** A Manager changes a callup's status by hand: Pending, Accepted or Declined (wireframe 3E). */
export async function setCallupResponse(ctx: CommandContext, eventId: string, userId: string, response: 'YES' | 'NO' | 'NO_RESPONSE'): Promise<void> {
  const ec = await managerEventContext(ctx, eventId);
  const updated = setCallupStatus(attendanceState(ec), userId, response);
  await saveRosterUpdates(ctx.tx, eventId, [updated], ctx.now);
  await ctx.tx`
    update public.callup_invitations set response = ${response}, responded_at = ${response === 'NO_RESPONSE' ? null : ctx.now}
    where id = (select id from public.callup_invitations where event_id = ${eventId} and user_id = ${userId} and closed_at is null
                order by invited_at desc limit 1)
  `;
  if (response === 'YES') {
    await notify(ctx.tx, [{ userId, teamId: ec.team.id, eventId, content: N.callupConfirmed(eventSummary(ec.event, ec.team)) }]);
  }
  await audit(ctx.tx, { teamId: ec.team.id, eventId, actorId: ctx.actorId, action: 'CALLUP_STATUS_SET', details: { userId, response } });
}

/**
 * A Manager approves or declines a Pending Approval player (wireframe 4D). Approved players are
 * told "You're In!"; declined ones "Not Selected".
 */
export async function decidePendingPlayer(ctx: CommandContext, eventId: string, userId: string, approve: boolean): Promise<void> {
  const ec = await managerEventContext(ctx, eventId);
  const updated = decidePending(attendanceState(ec), userId, approve);
  await saveRosterUpdates(ctx.tx, eventId, [updated], ctx.now);
  const summary = eventSummary(ec.event, ec.team);
  await notify(ctx.tx, [{ userId, teamId: ec.team.id, eventId, content: approve ? N.rosterSpotConfirmed(summary) : N.notSelected(summary) }]);
  await audit(ctx.tx, {
    teamId: ec.team.id,
    eventId,
    actorId: ctx.actorId,
    action: approve ? 'PENDING_APPROVED' : 'PENDING_DECLINED',
    details: { userId },
  });
}
