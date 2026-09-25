// Calendar subscriptions. Each person has one secret feed address; calendar apps fetch it without
// signing in, so the token in the address is the only key. Resetting it cuts off old copies.
import { buildCalendar, type AttendanceResponse, type EventType } from '../domain/index.ts';
import type { CommandContext, Sql, Tx } from './db.ts';

// Tokens are two random UUIDs as 64 hex characters (244 random bits), made by the database.
export const CALENDAR_TOKEN = /^[0-9a-f]{64}$/;

/** The person's feed token, created on first use. */
export async function getCalendarFeed(ctx: CommandContext): Promise<{ token: string }> {
  const [existing] = await ctx.tx<{ token: string }[]>`select token from public.calendar_feeds where user_id = ${ctx.actorId}`;
  if (existing) return existing;
  const [row] = await ctx.tx<{ token: string }[]>`
    insert into public.calendar_feeds (user_id, token) values (${ctx.actorId}, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
    on conflict (user_id) do update set user_id = excluded.user_id
    returning token
  `;
  return row;
}

/** A new token; calendars subscribed with the old address stop updating. */
export async function resetCalendarFeed(ctx: CommandContext): Promise<{ token: string }> {
  const [row] = await ctx.tx<{ token: string }[]>`
    insert into public.calendar_feeds (user_id, token) values (${ctx.actorId}, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
    on conflict (user_id) do update set token = excluded.token, created_at = now()
    returning token
  `;
  return row;
}

/**
 * The iCalendar text for a feed token, or null when no feed has it. Covers every Event of the
 * person's active Teams from 60 days back, with their own answer where they're on the roster.
 */
export async function calendarForToken(sql: Sql | Tx, token: string, now: Date, appUrl: string): Promise<string | null> {
  const [feed] = await sql<{ user_id: string }[]>`select user_id from public.calendar_feeds where token = ${token}`;
  if (!feed) return null;
  const rows = await sql<
    {
      id: string;
      team_id: string;
      team_name: string;
      type: EventType;
      name: string | null;
      opponent: string | null;
      location: string | null;
      notes: string | null;
      starts_at: Date;
      updated_at: Date;
      response: AttendanceResponse | null;
    }[]
  >`
    select e.id, t.id as team_id, t.name as team_name, e.type, e.name, e.opponent, e.location, e.notes, e.starts_at, e.updated_at,
      (select r.response from public.event_roster_players r
        where r.event_id = e.id and r.user_id = ${feed.user_id} and r.removed_at is null) as response
    from public.events e
    join public.teams t on t.id = e.team_id and t.deleted_at is null
    join public.team_memberships m on m.team_id = t.id and m.user_id = ${feed.user_id} and m.status = 'ACTIVE'
    where e.starts_at > ${new Date(now.getTime() - 60 * 86_400_000)}
    order by e.starts_at
  `;
  const base = appUrl.replace(/\/$/, '');
  return buildCalendar(
    rows.map((r) => ({
      id: r.id,
      teamName: r.team_name,
      type: r.type,
      name: r.name,
      opponent: r.opponent,
      location: r.location,
      notes: r.notes,
      startsAt: r.starts_at,
      updatedAt: r.updated_at,
      response: r.response,
      url: `${base}/event/${r.id}`,
    })),
    { now, showTeam: new Set(rows.map((r) => r.team_id)).size > 1 },
  );
}
