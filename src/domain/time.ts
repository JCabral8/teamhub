// Team-local time helpers. Timestamps are stored in UTC; scheduling and display use the
// Team's timezone, never the device's. Implemented on Intl so it runs in Node, Deno and Hermes.

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localParts(instant: Date, timeZone: string): LocalParts {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function offsetMs(instantMs: number, timeZone: string): number {
  const p = localParts(new Date(instantMs), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Team-local calendar date (YYYY-MM-DD) of an instant. */
export function localDate(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Team-local wall-clock time (HH:MM) of an instant. */
export function localTime(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function parseTime(time: string): { hour: number; minute: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) throw new RangeError(`Invalid time "${time}", expected HH:MM`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function parseDate(date: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`Invalid date "${date}", expected YYYY-MM-DD`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Converts a Team-local date and time to a UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const d = parseDate(date);
  const t = parseTime(time);
  const guess = Date.UTC(d.year, d.month - 1, d.day, t.hour, t.minute);
  const first = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(first, timeZone);
  return new Date(second);
}

export function addDays(date: string, days: number): string {
  const d = parseDate(date);
  const next = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export function addMinutesToTime(time: string, minutes: number): string | null {
  const t = parseTime(time);
  const total = t.hour * 60 + t.minute + minutes;
  if (total < 0 || total >= 24 * 60) return null;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
