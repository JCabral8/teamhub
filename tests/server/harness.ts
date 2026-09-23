// Integration test harness: a throwaway Postgres database with the real migrations applied on top of a
// minimal Supabase stub. Commands run exactly as the Edge Function runs them, one transaction each.
import { readFileSync, readdirSync } from 'node:fs';
import postgres from 'postgres';
import { DomainError, zonedToUtc } from '../../src/domain/index.ts';
import { commands } from '../../src/server/commands.ts';
import type { Sql, Tx } from '../../src/server/db.ts';
import { runScheduledJobs } from '../../src/server/jobs.ts';

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

export const TZ = 'America/Toronto';
export const DEFAULT_NOW = new Date('2026-10-01T12:00:00Z');

export interface Harness {
  sql: Sql;
  now: Date;
  setNow(at: Date | string): void;
  user(name: string): Promise<string>;
  run<T = any>(actorId: string, command: string, params?: Record<string, unknown>): Promise<T>;
  /** Runs a command expected to fail and returns its error code. */
  fail(actorId: string, command: string, params?: Record<string, unknown>): Promise<string>;
  jobs(): ReturnType<typeof runScheduledJobs>;
  asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function createHarness(): Promise<Harness> {
  const dbName = `teamhub_test_${process.pid}_${Math.floor(Math.random() * 1e9)}`;
  const admin = postgres(ADMIN_URL, { onnotice: () => {}, max: 1 });
  await admin.unsafe(`create database ${dbName}`);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${dbName}`;
  const sql = postgres(url.toString(), { onnotice: () => {}, max: 4 });
  await sql.unsafe(read('tests/server/supabase-stub.sql'));
  for (const file of readdirSync(new URL('supabase/migrations/', root)).sort()) {
    await sql.unsafe(read(`supabase/migrations/${file}`));
  }

  let clock = DEFAULT_NOW;
  let seq = 0;
  const run = (actorId: string, command: string, params: Record<string, unknown> = {}) =>
    sql.begin((tx) => commands[command]({ tx, actorId, now: clock, random: () => 0 }, params)) as Promise<any>;

  return {
    sql,
    get now() {
      return clock;
    },
    setNow(at) {
      clock = new Date(at);
    },
    async user(name) {
      const [u] = await sql<{ id: string }[]>`
        insert into auth.users (email, raw_user_meta_data)
        values (${`user${++seq}@example.test`}, ${sql.json({ display_name: name })})
        returning id
      `;
      return u.id;
    },
    run,
    async fail(actorId, command, params = {}) {
      try {
        await run(actorId, command, params);
      } catch (err) {
        if (err instanceof DomainError) return err.code;
        const code = (err as { code?: string }).code;
        return code ? `PG_${code}` : String(err);
      }
      throw new Error(`Expected ${command} to fail`);
    },
    jobs: () => sql.begin((tx) => runScheduledJobs({ tx, now: clock, random: () => 0 })),
    asUser(userId, fn) {
      return sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
        await tx`set local role authenticated`;
        return fn(tx);
      }) as Promise<any>;
    },
    async close() {
      await sql.end();
      await admin.unsafe(`drop database ${dbName} with (force)`);
      await admin.end();
    },
  };
}

export interface Member {
  userId: string;
  membershipId: string;
}

export interface TeamWorld {
  teamId: string;
  joinCode: string;
  managerId: string;
  pos: Record<string, string>;
  players: Record<string, Member>;
}

/**
 * A Team with a Manager (not playing) and a roster: G1, F1–F6, D1–D4 on the default roster, plus any
 * callups given as [name, Position name]. Position names: Goalie, Forward, Defence, Forward/Defence.
 */
export async function buildTeam(
  h: Harness,
  opts: { callups?: [string, string][]; roster?: [string, string][]; settings?: Record<string, unknown> } = {},
): Promise<TeamWorld> {
  const managerId = await h.user('Morgan Manager');
  const { teamId } = await h.run(managerId, 'createTeam', { name: 'Ice Hawks', timezone: TZ, arena: 'Civic Arena' });
  if (opts.settings) await h.run(managerId, 'updateTeamSettings', { teamId, ...opts.settings });
  const [{ join_code }] = await h.sql<{ join_code: string }[]>`select join_code from public.teams where id = ${teamId}`;
  const posRows = await h.sql<{ id: string; name: string }[]>`select id, name from public.team_positions where team_id = ${teamId}`;
  const pos = Object.fromEntries(posRows.map((p) => [p.name, p.id]));
  const world: TeamWorld = { teamId, joinCode: join_code, managerId, pos, players: {} };

  const roster: [string, string][] = opts.roster ?? [
    ['G1', 'Goalie'],
    ...['F1', 'F2', 'F3', 'F4', 'F5', 'F6'].map((n): [string, string] => [n, 'Forward']),
    ...['D1', 'D2', 'D3', 'D4'].map((n): [string, string] => [n, 'Defence']),
  ];
  for (const [name, position] of roster) world.players[name] = await addMember(h, world, name, position, 'ROSTER');
  for (const [name, position] of opts.callups ?? []) world.players[name] = await addMember(h, world, name, position, 'CALLUP');
  return world;
}

export async function addMember(h: Harness, world: TeamWorld, name: string, position: string, rosterRole: 'ROSTER' | 'CALLUP' | 'NONE'): Promise<Member> {
  const userId = await h.user(name);
  await h.run(userId, 'requestToJoin', { joinCode: world.joinCode });
  const [m] = await h.sql<{ id: string }[]>`select id from public.team_memberships where team_id = ${world.teamId} and user_id = ${userId}`;
  await h.run(world.managerId, 'approveMember', { membershipId: m.id, positionId: world.pos[position], rosterRole });
  return { userId, membershipId: m.id };
}

/** Creates an Event at a Team-local date and time (default: Sat Oct 10 2026, 9:30 PM). */
export async function createGame(
  h: Harness,
  world: TeamWorld,
  opts: { date?: string; time?: string; opponent?: string; type?: string; name?: string } = {},
): Promise<{ eventId: string; releaseDecisionRequired: boolean }> {
  return h.run(world.managerId, 'createEvent', {
    teamId: world.teamId,
    type: opts.type ?? 'GAME',
    name: opts.name,
    opponent: opts.opponent ?? 'Sharks',
    startsAt: zonedToUtc(opts.date ?? '2026-10-10', opts.time ?? '21:30', TZ).toISOString(),
  });
}

export async function releasedGame(h: Harness, world: TeamWorld, opts: Parameters<typeof createGame>[2] = {}): Promise<string> {
  const { eventId } = await createGame(h, world, opts);
  await h.run(world.managerId, 'sendAttendanceNow', { eventId });
  return eventId;
}

export async function everyoneYes(h: Harness, world: TeamWorld, eventId: string, except: string[] = []): Promise<void> {
  const rows = await h.sql<{ user_id: string }[]>`
    select user_id from public.event_roster_players where event_id = ${eventId} and removed_at is null and source = 'ROSTER'
  `;
  const skip = new Set(except.map((n) => world.players[n].userId));
  for (const r of rows) if (!skip.has(r.user_id)) await h.run(r.user_id, 'respondAttendance', { eventId, response: 'YES' });
}

export async function rosterRow(h: Harness, eventId: string, userId: string) {
  const [row] = await h.sql<
    { response: string; response_origin: string | null; reason: string | null; pending_since: Date | null; source: string; removed_at: Date | null }[]
  >`select response, response_origin, reason, pending_since, source, removed_at from public.event_roster_players where event_id = ${eventId} and user_id = ${userId}`;
  return row;
}

export async function notificationsFor(h: Harness, userId: string, type?: string) {
  return type
    ? h.sql<{ type: string; title: string; body: string; event_id: string | null }[]>`
        select type, title, body, event_id from public.notifications where user_id = ${userId} and type = ${type} order by created_at`
    : h.sql<{ type: string; title: string; body: string; event_id: string | null }[]>`
        select type, title, body, event_id from public.notifications where user_id = ${userId} order by created_at`;
}

export async function openInvites(h: Harness, eventId: string) {
  return h.sql<{ user_id: string; target_position_id: string | null; pool_key: string; rank: number; response: string }[]>`
    select user_id, target_position_id, pool_key, rank, response from public.callup_invitations
    where event_id = ${eventId} and closed_at is null order by invited_at, rank
  `;
}
