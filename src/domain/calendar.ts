// A person's TeamHub schedule as an iCalendar feed (RFC 5545), for Google, Apple and Outlook
// calendar subscriptions. Pure text building; loading the Events happens in the server.
import { eventLabel } from './notifications.ts';
import type { AttendanceResponse, EventType } from './types.ts';

export interface CalendarEvent {
  id: string;
  teamName: string;
  type: EventType;
  name: string | null;
  opponent: string | null;
  location: string | null;
  notes: string | null;
  startsAt: Date;
  updatedAt: Date;
  /** The person's own answer, or null when they aren't on this Event's roster. */
  response: AttendanceResponse | null;
  /** Opens the Event in TeamHub. */
  url: string;
}

/** Events have no end time in TeamHub; calendars show each one as this long. */
export const CALENDAR_EVENT_MINUTES = 90;

const ANSWERS: Record<AttendanceResponse, string> = { YES: 'Attending', NO: 'Not attending', NO_RESPONSE: 'No answer yet' };

/** 20260925T233000Z */
function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 bytes continue on the next line after a space (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/**
 * `showTeam` puts the Team name in front of each title, for people on more than one Team. Events the
 * person said No to stay on the calendar, marked "(Not attending)".
 */
export function buildCalendar(events: CalendarEvent[], opts: { now: Date; showTeam: boolean }): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TeamHub//Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:TeamHub',
    'X-WR-CALDESC:Your TeamHub schedule',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    const title = `${opts.showTeam ? `${e.teamName}: ` : ''}${eventLabel(e)}${e.response === 'NO' ? ' (Not attending)' : ''}`;
    const description = [
      e.teamName,
      e.response ? `Your answer: ${ANSWERS[e.response]}` : null,
      e.notes?.trim() || null,
      `Open in TeamHub: ${e.url}`,
    ]
      .filter(Boolean)
      .join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@teamhub`,
      `DTSTAMP:${utc(opts.now)}`,
      `LAST-MODIFIED:${utc(e.updatedAt)}`,
      // Later edits need a higher number so calendars replace their copy.
      `SEQUENCE:${Math.floor(e.updatedAt.getTime() / 1000)}`,
      `DTSTART:${utc(e.startsAt)}`,
      `DTEND:${utc(new Date(e.startsAt.getTime() + CALENDAR_EVENT_MINUTES * 60_000))}`,
      `SUMMARY:${escapeText(title)}`,
      ...(e.location?.trim() ? [`LOCATION:${escapeText(e.location.trim())}`] : []),
      `DESCRIPTION:${escapeText(description)}`,
      `URL:${e.url}`,
      `TRANSP:${e.response === 'NO' ? 'TRANSPARENT' : 'OPAQUE'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
