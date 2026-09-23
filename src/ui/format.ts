// Display helpers. Event times always render in the Team's time zone (spec §23).
import { notifications, type EventType, type RosterStanding } from '../domain/index.ts';
import type { Tone } from './theme';

export const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'GAME', label: 'Game' },
  { value: 'PRACTICE', label: 'Practice' },
  { value: 'TOURNAMENT', label: 'Tournament' },
  { value: 'SOCIAL', label: 'Social' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'CUSTOM', label: 'Custom' },
];

export function eventTitle(e: { type: EventType; name: string | null; opponent: string | null }): string {
  return notifications.eventLabel(e);
}

export function eventWhen(startsAt: string | Date, timezone: string): string {
  return notifications.formatEventTime(new Date(startsAt), timezone);
}

export function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function clock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Accepts "18:00", "6:00 pm", "6pm", "6:30PM" and returns HH:MM, or null. */
export function parseClockInput(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === 'am' && h === 12) h = 0;
    if (m[3] === 'pm' && h !== 12) h += 12;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export const STANDING_DISPLAY: Record<RosterStanding, { label: string; tone: Tone }> = {
  ATTENDING: { label: 'Attending', tone: 'positive' },
  PENDING_APPROVAL: { label: 'Pending Approval', tone: 'attention' },
  NO_RESPONSE: { label: 'No Response', tone: 'neutral' },
  NOT_ATTENDING: { label: 'Not Attending', tone: 'negative' },
};

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Deep link a Manager shares; opens the join screen in the app (spec §6). */
export const joinLink = (code: string) => `teamhub://join/${code}`;
