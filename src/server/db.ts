// Runtime-agnostic database plumbing shared by the Edge Functions (Deno) and the Node test suite.
import type postgres from 'postgres';
import { DomainError } from '../domain/index.ts';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

/** Everything a command needs: one transaction, who is acting, and an injectable clock and RNG. */
export interface CommandContext {
  tx: Tx;
  actorId: string;
  now: Date;
  random: () => number;
}

export interface SystemContext {
  tx: Tx;
  now: Date;
  random: () => number;
}

export function notFound(what: string): DomainError {
  return new DomainError('NOT_FOUND', `${what} not found.`);
}

export function forbidden(message = 'You do not have permission to do this.'): DomainError {
  return new DomainError('FORBIDDEN', message);
}

export async function audit(
  tx: Tx,
  entry: { teamId: string | null; eventId?: string | null; actorId: string | null; action: string; details?: Record<string, unknown> },
): Promise<void> {
  await tx`
    insert into public.audit_log (team_id, event_id, actor_id, action, details)
    values (${entry.teamId}, ${entry.eventId ?? null}, ${entry.actorId}, ${entry.action}, ${tx.json((entry.details ?? {}) as postgres.JSONValue)})
  `;
}
