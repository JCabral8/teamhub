// StatisticsService (spec §51, §52): visible to Managers and Players; current members only.
import { computeAttendanceStatistics, type AttendanceRecord, type PlayerAttendanceStats } from '../domain/index.ts';
import type { CommandContext } from './db.ts';
import { loadTeam, requireActor } from './load.ts';

export async function getAttendanceStatistics(
  ctx: CommandContext,
  teamId: string,
): Promise<(PlayerAttendanceStats & { displayName: string })[]> {
  await loadTeam(ctx.tx, teamId);
  await requireActor(ctx.tx, teamId, ctx.actorId);
  const regular = await ctx.tx<AttendanceRecord[]>`
    select rp.user_id as "userId", rp.source, rp.response
    from public.event_roster_players rp
    join public.events e on e.id = rp.event_id
    join public.team_memberships m on m.team_id = e.team_id and m.user_id = rp.user_id and m.status = 'ACTIVE'
    where e.team_id = ${teamId} and e.release_state = 'RELEASED' and rp.removed_at is null and rp.source <> 'CALLUP'
  `;
  const callups = await ctx.tx<AttendanceRecord[]>`
    select ci.user_id as "userId", 'CALLUP' as source, ci.response
    from public.callup_invitations ci
    join public.team_memberships m on m.team_id = ci.team_id and m.user_id = ci.user_id and m.status = 'ACTIVE'
    where ci.team_id = ${teamId}
  `;
  const names = new Map(
    (
      await ctx.tx<{ user_id: string; display_name: string }[]>`
        select m.user_id, p.display_name from public.team_memberships m join public.profiles p on p.id = m.user_id
        where m.team_id = ${teamId} and m.status = 'ACTIVE'
      `
    ).map((r) => [r.user_id, r.display_name]),
  );
  return computeAttendanceStatistics([...regular, ...callups])
    .map((s) => ({ ...s, displayName: names.get(s.userId) ?? '' }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
