// Display helpers. Event times always render in the Team's time zone (spec §23).
import { Platform } from 'react-native';
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

export const STANDING_DISPLAY: Record<RosterStanding, { label: string; tone: Tone }> = {
  ATTENDING: { label: 'Attending', tone: 'positive' },
  PENDING_APPROVAL: { label: 'Pending Approval', tone: 'attention' },
  NO_RESPONSE: { label: 'No Response', tone: 'neutral' },
  NOT_ATTENDING: { label: 'Not Attending', tone: 'negative' },
};

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
