import { describe, expect, it } from 'vitest';
import { buildCalendar, type CalendarEvent } from '../../src/domain/calendar.ts';

const game = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  teamName: 'Slapsticks',
  type: 'GAME',
  name: null,
  opponent: 'Rangers',
  location: 'Rink 2, Civic Centre',
  notes: null,
  startsAt: new Date('2026-10-02T23:30:00Z'),
  updatedAt: new Date('2026-09-25T12:00:00Z'),
  response: 'YES',
  url: 'https://teamhub.expo.app/event/e1',
  ...over,
});
const now = new Date('2026-09-25T20:00:00Z');
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('buildCalendar', () => {
  it('writes a valid calendar with CRLF line endings and one VEVENT per Event', () => {
    const ics = buildCalendar([game()], { now, showTeam: false });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
    const lines = unfold(ics).split('\r\n');
    expect(lines).toContain('UID:e1@teamhub');
    expect(lines).toContain('DTSTART:20261002T233000Z');
    expect(lines).toContain('DTEND:20261003T010000Z');
    expect(lines).toContain('SUMMARY:Game vs Rangers');
    expect(lines).toContain('LOCATION:Rink 2\\, Civic Centre');
    expect(lines).toContain('DESCRIPTION:Slapsticks\\nYour answer: Attending\\nOpen in TeamHub: https://teamhub.expo.app/event/e1');
  });

  it('marks Events the person said No to, and shows free time for them', () => {
    const lines = unfold(buildCalendar([game({ response: 'NO' })], { now, showTeam: false })).split('\r\n');
    expect(lines).toContain('SUMMARY:Game vs Rangers (Not attending)');
    expect(lines).toContain('TRANSP:TRANSPARENT');
  });

  it('names the Team when the person is on several', () => {
    const lines = unfold(buildCalendar([game({ response: null })], { now, showTeam: true })).split('\r\n');
    expect(lines).toContain('SUMMARY:Slapsticks: Game vs Rangers');
    expect(lines.find((l) => l.startsWith('DESCRIPTION:'))).not.toContain('Your answer');
  });

  it('folds long lines at 75 bytes and escapes notes', () => {
    const ics = buildCalendar([game({ notes: 'Bring both jerseys; light and dark.\nArrive 30 minutes early, the Zamboni runs long on Fridays.' })], { now, showTeam: false });
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(unfold(ics)).toContain('Bring both jerseys\\; light and dark.\\nArrive 30 minutes early\\, the Zamboni');
  });
});
