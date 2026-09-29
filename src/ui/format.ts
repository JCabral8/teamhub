// Display helpers. Event times always render in the Team's time zone (spec §23).
import { Platform } from 'react-native';
import { localTime, notifications, type EventType, type RosterStanding } from '../domain/index.ts';
import type { IconName } from './components';
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

/** The heading the wireframes use: "Slapsticks vs Bulldogs" for a Game, otherwise the Event's name. */
export function matchTitle(e: { type: EventType; name: string | null; opponent: string | null }, teamName: string): string {
  if (!e.name?.trim() && e.opponent?.trim()) return `${teamName} vs ${e.opponent.trim()}`;
  return eventTitle(e);
}

/** "6:00 PM – 8:00 PM", or just the start when there's no end time. */
export function timeRange(e: { starts_at: string; ends_at: string | null }, timezone: string): string {
  const start = clock(localTime(new Date(e.starts_at), timezone));
  return e.ends_at ? `${start} – ${clock(localTime(new Date(e.ends_at), timezone))}` : start;
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

export const STANDING_DISPLAY: Record<RosterStanding, { label: string; tone: Tone; icon: IconName }> = {
  ATTENDING: { label: 'Attending', tone: 'positive', icon: 'checkmark-circle' },
  PENDING_APPROVAL: { label: 'Pending Approval', tone: 'attention', icon: 'time' },
  MAYBE: { label: 'Maybe', tone: 'primary', icon: 'help-circle' },
  NO_RESPONSE: { label: 'No Response', tone: 'neutral', icon: 'help-circle' },
  NOT_ATTENDING: { label: 'Not Attending', tone: 'negative', icon: 'close-circle' },
};

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri, Sep 18, 2026" (or without the year) for a YYYY-MM-DD date. */
export function shortDate(date: string, withYear = true): string {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = SHORT_WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${SHORT_MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ''}`;
}

/** The two halves of the date column in schedule lists: "Thu" and "Sep 11". */
export function dateColumn(date: string): { weekday: string; day: string } {
  const [y, m, d] = date.split('-').map(Number);
  return { weekday: SHORT_WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()], day: `${SHORT_MONTHS[m - 1]} ${d}` };
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * A link to a screen, for sharing in a team chat. In the browser it's the web app's own address, so
 * it opens for anyone; in the phone app it's the app's scheme (`teamhub:/` + `/join/…` → `teamhub://join/…`).
 */
function appLink(path: string): string {
  return Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}${path}` : `teamhub:/${path}`;
}

/** Link a Manager shares to invite players; opens the join screen (spec §6). */
export const joinLink = (code: string) => appLink(`/join/${code}`);

/** Link to an Event, shared in the team chat when attendance goes out. */
export const eventLink = (id: string) => appLink(`/event/${id}`);
