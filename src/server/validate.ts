// Small input validators for command parameters. Every command validates its own input server-side.
import { DomainError } from '../domain/index.ts';

export type Params = Record<string, unknown>;

const invalid = (field: string, why: string) => new DomainError('INVALID_INPUT', `${field} ${why}.`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(p: Params, field: string): string {
  const v = p[field];
  if (typeof v !== 'string' || !UUID.test(v)) throw invalid(field, 'must be an id');
  return v;
}

export function uuidList(p: Params, field: string): string[] {
  const v = p[field];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !UUID.test(x))) throw invalid(field, 'must be a list of ids');
  return v as string[];
}

export function text(p: Params, field: string, opts: { max: number; optional?: false }): string;
export function text(p: Params, field: string, opts: { max: number; optional: true }): string | null;
export function text(p: Params, field: string, opts: { max: number; optional?: boolean }): string | null {
  const v = p[field];
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    if (opts.optional) return null;
    throw invalid(field, 'is required');
  }
  if (typeof v !== 'string') throw invalid(field, 'must be text');
  const t = v.trim();
  if ([...t].length > opts.max) throw invalid(field, `must be ${opts.max} characters or fewer`);
  return t;
}

export function has(p: Params, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(p, field);
}

export function oneOf<T extends string>(p: Params, field: string, values: readonly T[]): T {
  const v = p[field];
  if (typeof v !== 'string' || !values.includes(v as T)) throw invalid(field, `must be one of ${values.join(', ')}`);
  return v as T;
}

export function int(p: Params, field: string, min: number, max: number): number {
  const v = p[field];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw invalid(field, `must be a whole number from ${min} to ${max}`);
  return v;
}

export function bool(p: Params, field: string): boolean {
  const v = p[field];
  if (typeof v !== 'boolean') throw invalid(field, 'must be true or false');
  return v;
}

export function isoInstant(p: Params, field: string): Date {
  const v = p[field];
  const d = typeof v === 'string' ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime()) || !/T.*(Z|[+-]\d{2}:?\d{2})$/.test(v as string)) {
    throw invalid(field, 'must be an ISO timestamp with a timezone');
  }
  return d;
}

export function localDateField(p: Params, field: string): string {
  const v = p[field];
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw invalid(field, 'must be a date (YYYY-MM-DD)');
  }
  return v;
}

export function clockTime(p: Params, field: string): string {
  const v = p[field];
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw invalid(field, 'must be a time (HH:MM)');
  return v;
}

export function list(p: Params, field: string, max = 200): unknown[] {
  const v = p[field];
  if (!Array.isArray(v) || v.length > max) throw invalid(field, `must be a list of at most ${max} items`);
  return v;
}
