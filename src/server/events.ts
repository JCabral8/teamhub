// EventService: Event creation (single and bulk), editing and the roster snapshot (spec §11–§14, §21, §29, §30).
import {
  DomainError,
  computeDefaultReleaseAt,
  handleEventChange,
  planInitialRelease,
  resetForNewRelease,
  zonedToUtc,
  type EventType,
  type InitialReleasePlan,
} from '../domain/index.ts';
import * as N from '../domain/notifications.ts';
import { saveRosterUpdates } from './attendance.ts';
import { audit, type CommandContext, type Tx } from './db.ts';
import { attendanceSettings, eventSummary, loadEventContext, loadTeam, requireManager, type TeamRow } from './load.ts';
import { notify, toMany } from './notify.ts';

export interface EventFields {
  type: EventType;
  name: string | null;
  opponent: string | null;
  location: string | null;
  notes: string | null;
  startsAt: Date;
}

function validateFields(f: EventFields): void {
  if (f.type === 'CUSTOM' && !f.name) throw new DomainError('CUSTOM_EVENT_NAME_REQUIRED', 'Enter a name for the Custom Event.');
}

function planColumns(plan: InitialReleasePlan) {
  return plan.kind === 'SCHEDULED'
    ? { release_state: 'SCHEDULED' as const, release_at: plan.at, release_action: plan.action }
    : { release_state: 'UNSENT' as const, release_at: null, release_action: null };
}

async function insertEvent(tx: Tx, team: TeamRow, f: EventFields, actorId: string, now: Date) {
  validateFields(f);
  const plan = planInitialRelease(f.startsAt, attendanceSettings(team), now);
  const cols = planColumns(plan);
  const [event] = await tx<{ id: string }[]>`
    insert into public.events (team_id, type, name, opponent, location, notes, starts_at, created_by, release_state, release_at, release_action)
    values (${team.id}, ${f.type}, ${f.name}, ${f.opponent}, ${f.location ?? team.default_location ?? team.arena}, ${f.notes},
            ${f.startsAt}, ${actorId}, ${cols.release_state}, ${cols.release_at}, ${cols.release_action})
    returning id
  `;
  // Event Roster Snapshot: requirement quantities, default-roster players and their Positions (spec §21).
  await tx`
    insert into public.event_roster_requirements (event_id, team_position_id, quantity)
    select ${event.id}, team_position_id, quantity from public.default_roster_requirements where team_id = ${team.id}
  `;
  await tx`
    insert into public.event_roster_players (event_id, user_id, membership_id, source)
    select ${event.id}, m.user_id, m.id, 'ROSTER' from public.team_memberships m
    where m.team_id = ${team.id} and m.status = 'ACTIVE' and m.roster_role = 'ROSTER'
  `;
  await tx`
    insert into public.event_roster_positions (roster_player_id, team_position_id)
    select rp.id, mp.team_position_id
    from public.event_roster_players rp
    join public.member_positions mp on mp.membership_id = rp.membership_id
    where rp.event_id = ${event.id}
  `;
  await audit(tx, { teamId: team.id, eventId: event.id, actorId, action: 'EVENT_CREATED', details: { type: f.type, startsAt: f.startsAt.toISOString() } });
  return { eventId: event.id, releaseDecisionRequired: plan.kind === 'ASK_MANAGER' };
}

/** Create one Event. If the normal release time has passed the Manager must choose SEND NOW or HOLD OFF. */
export async function createEvent(ctx: CommandContext, teamId: string, fields: EventFields) {
  const team = await loadTeam(ctx.tx, teamId, true);
  await requireManager(ctx.tx, teamId, ctx.actorId);
  return insertEvent(ctx.tx, team, fields, ctx.actorId, ctx.now);
}

/** Calendar-based bulk creation (spec §14): the same Event details on each selected date. */
export async function createEvents(
  ctx: CommandContext,
  teamId: string,
  template: Omit<EventFields, 'startsAt'>,
  time: string,
  dates: string[],
) {
  if (!dates.length || dates.length > 200) throw new DomainError('INVALID_INPUT', 'Choose between 1 and 200 dates.');
  const team = await loadTeam(ctx.tx, teamId, true);
  await requireManager(ctx.tx, teamId, ctx.actorId);
  const results = [];
  for (const date of [...new Set(dates)].sort()) {
    results.push({ date, ...(await insertEvent(ctx.tx, team, { ...template, startsAt: zonedToUtc(date, time, team.timezone) }, ctx.actorId, ctx.now)) });
  }
  return results;
}

/**
 * Edit an Event. After release, a date or time change needs a new attendance release; other fields do
 * not (spec §30). Returns the warning the Manager sees.
 */
export async function updateEvent(ctx: CommandContext, eventId: string, patch: Partial<EventFields>) {
  const ec = await loadEventContext(ctx.tx, eventId, true);
  await requireManager(ctx.tx, ec.team.id, ctx.actorId);
  const before = ec.event;
  const next: EventFields = {
    type: patch.type ?? before.type,
    name: patch.name !== undefined ? patch.name : before.name,
    opponent: patch.opponent !== undefined ? patch.opponent : before.opponent,
    location: patch.location !== undefined ? patch.location : before.location,
    notes: patch.notes !== undefined ? patch.notes : before.notes,
    startsAt: patch.startsAt ?? before.starts_at,
  };
  validateFields(next);
  const released = before.release_state === 'RELEASED';
  const impact = handleEventChange({ startsAt: before.starts_at }, { startsAt: next.startsAt }, ec.team.timezone, released);

  await ctx.tx`
    update public.events set type = ${next.type}, name = ${next.name}, opponent = ${next.opponent},
      location = ${next.location}, notes = ${next.notes}, starts_at = ${next.startsAt}
    where id = ${eventId}
  `;

  let releaseDecisionRequired = false;
  if (impact.dateChanged || impact.timeChanged) {
    const settings = attendanceSettings(ec.team);
    const plan = planInitialRelease(next.startsAt, settings, ctx.now);
    if (impact.requiresNewRelease) {
      const { keep, dropped } = resetForNewRelease(ec.roster);
      await saveRosterUpdates(ctx.tx, eventId, keep, ctx.now);
      await ctx.tx`update public.event_roster_players set responded_at = null where event_id = ${eventId} and removed_at is null`;
      for (const userId of dropped) {
        await ctx.tx`update public.event_roster_players set removed_at = ${ctx.now} where event_id = ${eventId} and user_id = ${userId}`;
      }
      await ctx.tx`update public.callup_invitations set closed_at = ${ctx.now}, closed_by = ${ctx.actorId} where event_id = ${eventId} and closed_at is null`;
      const cols = planColumns(plan);
      await ctx.tx`
        update public.events set release_state = ${cols.release_state}, release_at = ${cols.release_at},
          release_action = ${cols.release_action}, released_at = null, ready_notified_at = null, reminder_sent_at = null
        where id = ${eventId}
      `;
      releaseDecisionRequired = plan.kind === 'ASK_MANAGER';
    } else if (before.release_state === 'SCHEDULED') {
      // Keep a Manager's custom schedule if it still fits; move a default schedule with the Event.
      const wasDefault = before.release_at?.getTime() === computeDefaultReleaseAt(before.starts_at, settings).getTime();
      const stillValid = before.release_at && before.release_at > ctx.now && before.release_at < next.startsAt;
      if (wasDefault || !stillValid) {
        const cols = planColumns(plan);
        await ctx.tx`update public.events set release_state = ${cols.release_state}, release_at = ${cols.release_at}, release_action = ${cols.release_action} where id = ${eventId}`;
        releaseDecisionRequired = plan.kind === 'ASK_MANAGER';
      }
    }
    const summary = eventSummary({ ...before, ...next, starts_at: next.startsAt }, ec.team);
    const people = ec.roster.map((e) => e.userId);
    if (impact.dateChanged) await notify(ctx.tx, toMany(people, ec.team.id, eventId, N.eventDateChanged(summary)));
    else await notify(ctx.tx, toMany(people, ec.team.id, eventId, N.eventTimeChanged(summary)));
  }

  await audit(ctx.tx, {
    teamId: ec.team.id,
    eventId,
    actorId: ctx.actorId,
    action: 'EVENT_CHANGED',
    details: { dateChanged: impact.dateChanged, timeChanged: impact.timeChanged, newReleaseRequired: impact.requiresNewRelease },
  });
  return { warning: impact.warning, releaseDecisionRequired };
}

export async function deleteEvent(ctx: CommandContext, eventId: string): Promise<void> {
  const ec = await loadEventContext(ctx.tx, eventId, true);
  await requireManager(ctx.tx, ec.team.id, ctx.actorId);
  await ctx.tx`delete from public.events where id = ${eventId}`;
  await audit(ctx.tx, { teamId: ec.team.id, eventId, actorId: ctx.actorId, action: 'EVENT_DELETED' });
}
