// Scheduled work, run every minute by pg_cron through the `jobs` Edge Function.
import { countIncompleteAttendance } from '../domain/index.ts';
import * as N from '../domain/notifications.ts';
import { releaseEventAttendance } from './attendance.ts';
import { audit, type SystemContext } from './db.ts';
import { eventSummary, loadEventContext, loadTeam, teamManagerIds } from './load.ts';
import { notify, toMany } from './notify.ts';

export interface JobsResult {
  released: string[];
  readyNotified: string[];
  reminded: string[];
}

export async function runScheduledJobs(ctx: SystemContext): Promise<JobsResult> {
  const { tx, now } = ctx;
  const result: JobsResult = { released: [], readyNotified: [], reminded: [] };

  const due = await tx<{ id: string; release_action: 'RELEASE' | 'NOTIFY_MANAGER' }[]>`
    select e.id, e.release_action from public.events e
    join public.teams t on t.id = e.team_id and t.deleted_at is null
    where e.release_state = 'SCHEDULED' and e.release_at <= ${now}
    order by e.release_at
    for update of e skip locked
  `;
  for (const e of due) {
    if (e.release_action === 'RELEASE') {
      // AUTOMATIC mode or a Manager's SCHEDULE LATER choice.
      await releaseEventAttendance(tx, e.id, now, ctx.random, null);
      result.released.push(e.id);
    } else {
      // MANUAL mode: tell Managers attendance is ready, and that it has NOT been sent (spec §26).
      await tx`
        update public.events set release_state = 'UNSENT', release_at = null, release_action = null, ready_notified_at = ${now}
        where id = ${e.id}
      `;
      const ec = await loadEventContext(tx, e.id, false);
      await notify(tx, toMany(await teamManagerIds(tx, ec.team.id), ec.team.id, e.id, N.attendanceReady(eventSummary(ec.event, ec.team))));
      await audit(tx, { teamId: ec.team.id, eventId: e.id, actorId: null, action: 'ATTENDANCE_READY' });
      result.readyNotified.push(e.id);
    }
  }

  // "X number of people have not completed their attendance" (spec §54), configurable per Team.
  const reminders = await tx<{ id: string; team_id: string }[]>`
    select e.id, e.team_id from public.events e
    join public.teams t on t.id = e.team_id and t.deleted_at is null
    where e.release_state = 'RELEASED' and e.reminder_sent_at is null and t.reminder_enabled
      and e.starts_at > ${now}
      and e.starts_at - make_interval(hours => t.reminder_hours_before) <= ${now}
    for update of e skip locked
  `;
  for (const e of reminders) {
    const ec = await loadEventContext(tx, e.id, false);
    const incomplete = countIncompleteAttendance(ec.roster);
    await tx`update public.events set reminder_sent_at = ${now} where id = ${e.id}`;
    if (incomplete > 0) {
      const team = await loadTeam(tx, e.team_id);
      await notify(tx, toMany(await teamManagerIds(tx, team.id), team.id, e.id, N.attendanceReminder(eventSummary(ec.event, team), incomplete)));
      result.reminded.push(e.id);
    }
  }
  return result;
}
