import { describe, expect, it } from 'vitest';
import {
  EVENT_DATETIME_CHANGED_WARNING,
  canDeleteTeam,
  canRemoveAssistantRole,
  canRemoveMember,
  computeAttendanceStatistics,
  computeDefaultReleaseAt,
  getSchedulableDateRange,
  getScheduleTimeOptions,
  handleEventChange,
  isUnavailableOn,
  localDate,
  localTime,
  notifications,
  planInitialRelease,
  scheduleAttendance,
  transferManager,
  validateHybridPosition,
  validatePositionName,
  zonedToUtc,
  type TeamAttendanceSettings,
} from '../../src/domain/index.ts';
import { D, F, FD, G } from './fixtures.ts';

const TZ = 'America/Toronto';
const settings = (over: Partial<TeamAttendanceSettings> = {}): TeamAttendanceSettings => ({
  timezone: TZ,
  attendanceMode: 'AUTOMATIC',
  releaseDaysBefore: 2,
  releaseTime: '18:00',
  reminderEnabled: true,
  reminderHoursBefore: 12,
  ...over,
});
// Saturday Oct 10 2026, 9:30 PM in Toronto (EDT, UTC-4).
const EVENT = zonedToUtc('2026-10-10', '21:30', TZ);

describe('Team local time', () => {
  it('converts between Team local time and UTC regardless of device timezone', () => {
    expect(EVENT.toISOString()).toBe('2026-10-11T01:30:00.000Z');
    expect(localDate(EVENT, TZ)).toBe('2026-10-10');
    expect(localTime(EVENT, TZ)).toBe('21:30');
  });

  it('handles daylight saving boundaries', () => {
    expect(zonedToUtc('2026-11-02', '18:00', TZ).toISOString()).toBe('2026-11-02T23:00:00.000Z');
    expect(zonedToUtc('2026-10-30', '18:00', TZ).toISOString()).toBe('2026-10-30T22:00:00.000Z');
  });
});

describe('Attendance release scheduling', () => {
  it('defaults to 6:00 PM Team time two calendar days before the Event', () => {
    expect(computeDefaultReleaseAt(EVENT, settings()).toISOString()).toBe('2026-10-08T22:00:00.000Z');
  });

  it('#20 automatic mode schedules a release', () => {
    const plan = planInitialRelease(EVENT, settings(), new Date('2026-10-01T00:00:00Z'));
    expect(plan).toEqual({ kind: 'SCHEDULED', action: 'RELEASE', at: new Date('2026-10-08T22:00:00.000Z') });
  });

  it('#21 manual mode only notifies the manager at that time', () => {
    const plan = planInitialRelease(EVENT, settings({ attendanceMode: 'MANUAL' }), new Date('2026-10-01T00:00:00Z'));
    expect(plan).toMatchObject({ kind: 'SCHEDULED', action: 'NOTIFY_MANAGER' });
  });

  it('#24 an Event created after the release time asks the manager instead of sending', () => {
    expect(planInitialRelease(EVENT, settings(), new Date('2026-10-09T12:00:00Z'))).toEqual({ kind: 'ASK_MANAGER' });
  });

  it('#22 offers one hour before, the Team default and one hour after', () => {
    expect(getScheduleTimeOptions('18:00')).toEqual([
      { time: '17:00', label: '5:00 PM', isTeamDefault: false },
      { time: '18:00', label: '6:00 PM · Team Default', isTeamDefault: true },
      { time: '19:00', label: '7:00 PM', isTeamDefault: false },
    ]);
  });

  it('#22 only allows dates from today through the Event date, and times before the Event', () => {
    const now = new Date('2026-10-05T16:00:00Z');
    expect(getSchedulableDateRange(now, EVENT, TZ)).toEqual({ first: '2026-10-05', last: '2026-10-10' });
    expect(scheduleAttendance({ date: '2026-10-07', time: '18:00' }, now, EVENT, TZ).toISOString()).toBe(
      '2026-10-07T22:00:00.000Z',
    );
    expect(() => scheduleAttendance({ date: '2026-10-11', time: '09:00' }, now, EVENT, TZ)).toThrow(/between today/);
    expect(() => scheduleAttendance({ date: '2026-10-04', time: '18:00' }, now, EVENT, TZ)).toThrow(/between today/);
    expect(() => scheduleAttendance({ date: '2026-10-10', time: '22:00' }, now, EVENT, TZ)).toThrow(/before the Event/);
  });
});

describe('Event changes after release', () => {
  const later = (date: string, time: string) => ({ startsAt: zonedToUtc(date, time, TZ) });

  it('#25 a date change needs a new release and warns the manager', () => {
    const impact = handleEventChange({ startsAt: EVENT }, later('2026-10-11', '21:30'), TZ, true);
    expect(impact).toEqual({ dateChanged: true, timeChanged: false, requiresNewRelease: true, warning: EVENT_DATETIME_CHANGED_WARNING });
  });

  it('#26 a time change needs a new release', () => {
    expect(handleEventChange({ startsAt: EVENT }, later('2026-10-10', '20:00'), TZ, true).requiresNewRelease).toBe(true);
  });

  it('#27 #28 opponent or location changes keep the current release', () => {
    expect(handleEventChange({ startsAt: EVENT }, { startsAt: EVENT }, TZ, true).requiresNewRelease).toBe(false);
  });

  it('nothing to redo before release', () => {
    expect(handleEventChange({ startsAt: EVENT }, later('2026-10-11', '21:30'), TZ, false).warning).toBeNull();
  });
});

describe('Availability', () => {
  it('#29 matches the Event date in Team local time', () => {
    // 9:30 PM on the 10th in Toronto is already the 11th in UTC.
    expect(isUnavailableOn(EVENT, TZ, [{ startDate: '2026-10-10', endDate: '2026-10-10' }])).toBe(true);
    expect(isUnavailableOn(EVENT, TZ, [{ startDate: '2026-10-11', endDate: '2026-10-12' }])).toBe(false);
  });
});

describe('Positions', () => {
  const existing = [G, F, D];

  it('#15 creates a custom base Position', () => {
    expect(validatePositionName(' Striker ', existing)).toBe('Striker');
    expect(() => validatePositionName('forward', existing)).toThrow(/already exists/);
  });

  it('#16 creates a Hybrid Position from existing base Positions', () => {
    expect(validateHybridPosition([D.id, F.id], existing)).toEqual({ componentIds: [F.id, D.id], name: 'Forward/Defence' });
    const striker = { id: 'pos-s', name: 'Striker', kind: 'BASE' as const, componentIds: [], sortOrder: 3 };
    expect(validateHybridPosition([F.id, D.id, striker.id], [...existing, striker]).name).toBe('Forward/Defence/Striker');
  });

  it('#17 rejects hybrids of missing Positions, the Goalie, duplicates, or a single Position', () => {
    expect(() => validateHybridPosition(['pos-striker', D.id], existing)).toThrow(/existing base Positions/);
    expect(() => validateHybridPosition([G.id, D.id], existing)).toThrow(/existing base Positions/);
    expect(() => validateHybridPosition([F.id], existing)).toThrow(/at least two/);
    expect(() => validateHybridPosition([F.id, D.id], [...existing, FD])).toThrow(/already exists/);
  });
});

describe('Manager governance', () => {
  const manager = { userId: 'm', role: 'MANAGER' as const };
  const assistant = { userId: 'a', role: 'ASSISTANT_MANAGER' as const };
  const assistant2 = { userId: 'a2', role: 'ASSISTANT_MANAGER' as const };
  const player = { userId: 'p', role: null };

  it('#31 transferring makes the previous Manager an Assistant Manager', () => {
    expect(transferManager(manager, player)).toEqual({
      previousManager: { userId: 'm', role: 'ASSISTANT_MANAGER' },
      newManager: { userId: 'p', role: 'MANAGER' },
    });
    expect(() => transferManager(assistant, player)).toThrow(/Team Manager/);
  });

  it('#32 assistants can remove themselves but not other assistants', () => {
    expect(canRemoveAssistantRole(assistant, assistant)).toBe(true);
    expect(canRemoveAssistantRole(assistant, assistant2)).toBe(false);
    expect(canRemoveAssistantRole(manager, assistant)).toBe(true);
    expect(canRemoveMember(assistant, assistant2)).toBe(false);
    expect(canRemoveMember(assistant, player)).toBe(true);
    expect(canRemoveMember(assistant, manager)).toBe(false);
  });

  it('only the Team Manager deletes the Team', () => {
    expect(canDeleteTeam(manager)).toBe(true);
    expect(canDeleteTeam(assistant)).toBe(false);
  });
});

describe('Statistics', () => {
  it('tracks regular and callup attendance separately', () => {
    const stats = computeAttendanceStatistics([
      { userId: 'p', source: 'ROSTER', response: 'YES' },
      { userId: 'p', source: 'ROSTER', response: 'NO' },
      { userId: 'p', source: 'ROSTER', response: 'NO_RESPONSE' },
      { userId: 'p', source: 'CALLUP', response: 'YES' },
      { userId: 'p', source: 'CALLUP', response: 'NO' },
    ]);
    expect(stats).toEqual([
      {
        userId: 'p',
        regular: { invitations: 3, yes: 1, no: 1, noResponse: 1 },
        callup: { invitations: 2, accepted: 1, declined: 1, noResponse: 0 },
      },
    ]);
  });
});

describe('Notifications', () => {
  const event = { type: 'GAME' as const, name: null, opponent: 'Hawks', startsAt: EVENT, timezone: TZ };

  it('#39 an invitation reads the same for everyone and never mentions callups', () => {
    const n = notifications.eventInvitation(event);
    expect(n).toEqual({ type: 'EVENT_INVITATION', title: 'Game vs Hawks · Sat, Oct 10, 9:30 PM', body: 'Are you attending? Tap to respond.' });
    expect(JSON.stringify(n)).not.toMatch(/callup/i);
  });

  it('manual mode tells the manager attendance has not been sent yet', () => {
    const n = notifications.attendanceReady(event);
    expect(n.title).toBe('Attendance is ready to send.');
    expect(n.body).toMatch(/NOT been sent/);
  });

  it('the reminder counts incomplete attendance', () => {
    expect(notifications.attendanceReminder(event, 3).body).toBe('3 people have not completed their attendance.');
  });
});
