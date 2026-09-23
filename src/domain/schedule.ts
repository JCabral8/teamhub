import { addDays, addMinutesToTime, localDate, localTime, zonedToUtc } from './time.ts';
import { DomainError, type TeamAttendanceSettings } from './types.ts';

export const EVENT_DATETIME_CHANGED_WARNING =
  'The Event date/time has changed. A new attendance request will need to be sent.';

/** Default release: N calendar days before the Event's local date, at the Team's release time (spec §25). */
export function computeDefaultReleaseAt(
  startsAt: Date,
  settings: Pick<TeamAttendanceSettings, 'timezone' | 'releaseDaysBefore' | 'releaseTime'>,
): Date {
  const eventDate = localDate(startsAt, settings.timezone);
  return zonedToUtc(addDays(eventDate, -settings.releaseDaysBefore), settings.releaseTime, settings.timezone);
}

export type InitialReleasePlan =
  /** Release time already passed: ask the manager SEND NOW or HOLD OFF; never send silently (spec §29). */
  | { kind: 'ASK_MANAGER' }
  | { kind: 'SCHEDULED'; action: 'RELEASE' | 'NOTIFY_MANAGER'; at: Date };

export function planInitialRelease(startsAt: Date, settings: TeamAttendanceSettings, now: Date): InitialReleasePlan {
  const at = computeDefaultReleaseAt(startsAt, settings);
  if (at.getTime() <= now.getTime()) return { kind: 'ASK_MANAGER' };
  return { kind: 'SCHEDULED', action: settings.attendanceMode === 'AUTOMATIC' ? 'RELEASE' : 'NOTIFY_MANAGER', at };
}

export interface TimeOption {
  time: string;
  label: string;
  isTeamDefault: boolean;
}

function formatClock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * SCHEDULE LATER time choices (spec §27): one hour before the default, the Team default (selected
 * initially), one hour after. Custom Time is offered separately by the picker.
 */
export function getScheduleTimeOptions(teamDefault: string): TimeOption[] {
  const options: TimeOption[] = [];
  const before = addMinutesToTime(teamDefault, -60);
  const after = addMinutesToTime(teamDefault, 60);
  if (before) options.push({ time: before, label: formatClock(before), isTeamDefault: false });
  options.push({ time: teamDefault, label: `${formatClock(teamDefault)} · Team Default`, isTeamDefault: true });
  if (after) options.push({ time: after, label: formatClock(after), isTeamDefault: false });
  return options;
}

/** Selectable dates: today through the Event date, in Team local time. Past and post-Event dates are disabled. */
export function getSchedulableDateRange(now: Date, startsAt: Date, timezone: string): { first: string; last: string } {
  return { first: localDate(now, timezone), last: localDate(startsAt, timezone) };
}

export function isSchedulableDate(date: string, range: { first: string; last: string }): boolean {
  return date >= range.first && date <= range.last;
}

/** Validates a SCHEDULE LATER choice and returns the UTC release instant. */
export function scheduleAttendance(
  choice: { date: string; time: string },
  now: Date,
  startsAt: Date,
  timezone: string,
): Date {
  const range = getSchedulableDateRange(now, startsAt, timezone);
  if (!isSchedulableDate(choice.date, range)) {
    throw new DomainError('SCHEDULE_DATE_INVALID', 'Choose a date between today and the Event date.');
  }
  const at = zonedToUtc(choice.date, choice.time, timezone);
  if (at.getTime() <= now.getTime()) throw new DomainError('SCHEDULE_IN_PAST', 'Choose a time in the future.');
  if (at.getTime() >= startsAt.getTime()) {
    throw new DomainError('SCHEDULE_AFTER_EVENT', 'Attendance must be sent before the Event starts.');
  }
  return at;
}

export interface EventChangeImpact {
  dateChanged: boolean;
  timeChanged: boolean;
  /** Only date or time changes after release need a new attendance release (spec §30). */
  requiresNewRelease: boolean;
  warning: string | null;
}

export function handleEventChange(
  before: { startsAt: Date },
  after: { startsAt: Date },
  timezone: string,
  attendanceReleased: boolean,
): EventChangeImpact {
  const dateChanged = localDate(before.startsAt, timezone) !== localDate(after.startsAt, timezone);
  const timeChanged = localTime(before.startsAt, timezone) !== localTime(after.startsAt, timezone);
  const requiresNewRelease = attendanceReleased && (dateChanged || timeChanged);
  return {
    dateChanged,
    timeChanged,
    requiresNewRelease,
    warning: requiresNewRelease ? EVENT_DATETIME_CHANGED_WARNING : null,
  };
}

/** When the "not completed their attendance" reminder goes to managers (spec §54). */
export function reminderDueAt(startsAt: Date, hoursBefore: number): Date {
  return new Date(startsAt.getTime() - hoursBefore * 3_600_000);
}

/** Whether a player's unavailable dates cover the Event's local date (spec §15, §57). */
export function isUnavailableOn(
  eventStartsAt: Date,
  timezone: string,
  blocks: { startDate: string; endDate: string }[],
): boolean {
  const date = localDate(eventStartsAt, timezone);
  return blocks.some((b) => date >= b.startDate && date <= b.endDate);
}
