// HTTP entry points built on the standard Request/Response API, shared by the Deno Edge Functions and
// the Node tests. Each command runs in one database transaction.
import { DomainError } from '../domain/index.ts';
import { commands } from './commands.ts';
import type { Sql } from './db.ts';
import { runScheduledJobs } from './jobs.ts';

export interface ApiDeps {
  sql: Sql;
  /** Resolves a bearer token to a user id, or null when it is not a valid signed-in user. */
  authenticate: (token: string) => Promise<string | null>;
  now?: () => Date;
  random?: () => number;
  log?: (entry: Record<string, unknown>) => void;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const STATUS: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404 };

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : null;
}

export function errorResponse(err: unknown, log: ApiDeps['log'], context: Record<string, unknown>): Response {
  if (err instanceof DomainError) {
    return json(STATUS[err.code] ?? 400, { ok: false, error: { code: err.code, message: err.message } });
  }
  const pgCode = (err as { code?: string })?.code;
  if (typeof pgCode === 'string' && pgCode.startsWith('23')) {
    log?.({ level: 'warn', ...context, pgCode, message: (err as Error).message });
    return json(409, { ok: false, error: { code: 'CONFLICT', message: 'That change conflicts with the current data. Refresh and try again.' } });
  }
  log?.({ level: 'error', ...context, message: (err as Error)?.message, stack: (err as Error)?.stack });
  return json(500, { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong.' } });
}

/** POST { command, params } with the user's access token. */
export async function handleApi(req: Request, deps: ApiDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } });

  const token = bearer(req);
  const userId = token ? await deps.authenticate(token) : null;
  if (!userId) return json(401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in again.' } });

  let body: { command?: unknown; params?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: { code: 'INVALID_JSON', message: 'Request body must be JSON.' } });
  }
  const name = typeof body.command === 'string' ? body.command : '';
  const handler = Object.prototype.hasOwnProperty.call(commands, name) ? commands[name] : undefined;
  if (!handler) return json(404, { ok: false, error: { code: 'UNKNOWN_COMMAND', message: `Unknown command "${name}".` } });
  const params = (body.params && typeof body.params === 'object' ? body.params : {}) as Record<string, unknown>;

  const started = Date.now();
  try {
    const data = await deps.sql.begin((tx) =>
      handler({ tx, actorId: userId, now: deps.now?.() ?? new Date(), random: deps.random ?? Math.random }, params),
    );
    deps.log?.({ level: 'info', command: name, userId, ms: Date.now() - started });
    return json(200, { ok: true, data: data ?? null });
  } catch (err) {
    return errorResponse(err, deps.log, { command: name, userId });
  }
}

/** Invoked every minute by pg_cron with the service role key. */
export async function handleJobs(req: Request, deps: Omit<ApiDeps, 'authenticate'> & { isAuthorized: (req: Request) => boolean }): Promise<Response> {
  if (!deps.isAuthorized(req)) return json(401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Not allowed.' } });
  try {
    const data = await deps.sql.begin((tx) =>
      runScheduledJobs({ tx, now: deps.now?.() ?? new Date(), random: deps.random ?? Math.random }),
    );
    deps.log?.({ level: 'info', job: 'scheduled', ...data });
    return json(200, { ok: true, data });
  } catch (err) {
    return errorResponse(err, deps.log, { job: 'scheduled' });
  }
}
