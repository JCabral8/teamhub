import { hasRosterSpaceFor, isAttending, standingOf, type RosterContext } from './roster.ts';
import {
  DECLINE_REASON_MAX_LENGTH,
  DomainError,
  type AttendanceAnswer,
  type EventRosterEntry,
  type ResponseOrigin,
} from './types.ts';

export interface EventAttendanceState extends RosterContext {
  released: boolean;
  /** Active Event roster entries (removed players are excluded). */
  roster: EventRosterEntry[];
}

export type AttendanceNotice =
  | { kind: 'PENDING_APPROVAL'; userId: string }
  | { kind: 'ROSTER_DISCREPANCY'; userId: string }
  | { kind: 'CALLUP_ACCEPTED'; userId: string }
  | { kind: 'CALLUP_DECLINED'; userId: string }
  | { kind: 'CALLUP_CONFIRMED'; userId: string };

export interface AttendanceChangeResult {
  /** Entries whose state changed, in their new form. */
  updates: EventRosterEntry[];
  notices: AttendanceNotice[];
  /** True when an attending player stopped attending, so a spot opened. */
  spotOpened: boolean;
}

/** Trims and validates an optional decline reason (spec §32). Reasons only accompany NO. */
export function normalizeDeclineReason(answer: AttendanceAnswer, reason: string | null | undefined): string | null {
  if (answer !== 'NO') return null;
  const trimmed = (reason ?? '').trim();
  if (!trimmed) return null;
  if ([...trimmed].length > DECLINE_REASON_MAX_LENGTH) {
    throw new DomainError('REASON_TOO_LONG', `Reason must be ${DECLINE_REASON_MAX_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

function diff(before: EventRosterEntry[], after: EventRosterEntry[]): EventRosterEntry[] {
  const prev = new Map(before.map((e) => [e.userId, e]));
  return after.filter((e) => {
    const p = prev.get(e.userId);
    return (
      !p ||
      p.response !== e.response ||
      p.pendingSince !== e.pendingSince ||
      p.reason !== e.reason ||
      p.responseOrigin !== e.responseOrigin
    );
  });
}

/**
 * Applies a YES, NO or MAYBE answer (spec §37, §48; wireframes 4, 6, 7). Default-roster players who
 * say YES without a free spot go to PENDING APPROVAL and Managers are told; a Manager then approves or
 * declines them (wireframe 4). Nobody is promoted automatically. Callups never go pending: a callup
 * YES either fills a spot or is refused. MAYBE holds no spot.
 */
export function processAttendanceChange(
  state: EventAttendanceState,
  userId: string,
  answer: AttendanceAnswer,
  reasonInput: string | null | undefined,
  now: Date,
  origin: ResponseOrigin = 'PLAYER',
): AttendanceChangeResult {
  if (!state.released) {
    throw new DomainError('ATTENDANCE_NOT_RELEASED', 'Attendance has not been sent for this Event yet.');
  }
  const roster = state.roster.map((e) => ({ ...e }));
  const entry = roster.find((e) => e.userId === userId);
  if (!entry) throw new DomainError('NOT_ON_EVENT_ROSTER', 'This player is not on the Event roster.');

  const reason = normalizeDeclineReason(answer, reasonInput);
  const wasAttending = isAttending(entry);
  const previous = entry.response;
  const notices: AttendanceNotice[] = [];

  if (answer === 'NO' || answer === 'MAYBE') {
    entry.response = answer;
    entry.pendingSince = null;
    entry.reason = reason;
    entry.responseOrigin = origin;
    if (answer === 'NO' && entry.source === 'CALLUP' && previous !== 'NO') {
      notices.push({ kind: 'CALLUP_DECLINED', userId });
    }
  } else if (previous !== 'YES') {
    entry.reason = null;
    entry.responseOrigin = origin;
    if (hasRosterSpaceFor(roster, entry, state)) {
      entry.response = 'YES';
      entry.pendingSince = null;
      if (entry.source === 'CALLUP') notices.push({ kind: 'CALLUP_ACCEPTED', userId }, { kind: 'CALLUP_CONFIRMED', userId });
    } else if (entry.source === 'CALLUP') {
      throw new DomainError('CALLUP_SPOT_FILLED', 'This spot has already been filled.');
    } else {
      entry.response = 'YES';
      entry.pendingSince = now.toISOString();
      notices.push({ kind: 'PENDING_APPROVAL', userId }, { kind: 'ROSTER_DISCREPANCY', userId });
    }
  }

  return {
    updates: diff(state.roster, roster),
    notices,
    spotOpened: wasAttending && !isAttending(entry),
  };
}

/** Whether a YES from this player would have to wait for approval right now (wireframe 4A). */
export function wouldBePending(state: EventAttendanceState, userId: string): boolean {
  const entry = state.roster.find((e) => e.userId === userId);
  if (!entry || entry.source === 'CALLUP' || isAttending(entry)) return false;
  return !hasRosterSpaceFor(state.roster, { ...entry, response: 'YES', pendingSince: null }, state);
}

/**
 * A Manager decides on a Pending Approval player (wireframe 4D). Approving adds them to the attending
 * roster even if that takes it past the requirements, since the Manager chose to; declining records
 * NO as the Manager's decision ("Not Selected").
 */
export function decidePending(state: EventAttendanceState, userId: string, approve: boolean): EventRosterEntry {
  const entry = state.roster.find((e) => e.userId === userId);
  if (!entry || standingOf(entry) !== 'PENDING_APPROVAL') {
    throw new DomainError('NOT_PENDING', 'This player is not waiting for approval.');
  }
  return approve
    ? { ...entry, pendingSince: null }
    : { ...entry, response: 'NO', pendingSince: null, reason: null, responseOrigin: 'MANAGER' };
}

/** A Manager sets a callup's status by hand (wireframe 3E): Pending, Accepted or Declined. */
export function setCallupStatus(state: EventAttendanceState, userId: string, response: 'YES' | 'NO' | 'NO_RESPONSE'): EventRosterEntry {
  const entry = state.roster.find((e) => e.userId === userId);
  if (!entry || entry.source !== 'CALLUP') throw new DomainError('NOT_A_CALLUP', 'This player is not a callup on this Event.');
  return { ...entry, response, pendingSince: null, reason: null, responseOrigin: response === 'NO_RESPONSE' ? null : 'MANAGER' };
}

export interface ReleaseResult {
  updates: EventRosterEntry[];
  /** Players who receive the attendance request (everyone still awaiting a response). */
  invitees: string[];
}

/**
 * Releases attendance (spec §26, §57). Players who marked the Event's date unavailable are recorded
 * as NO automatically, flagged as system-generated; everyone else is asked.
 */
export function releaseAttendance(roster: EventRosterEntry[], unavailableUserIds: ReadonlySet<string>): ReleaseResult {
  const updates: EventRosterEntry[] = [];
  const invitees: string[] = [];
  for (const e of roster) {
    if (e.response !== 'NO_RESPONSE') continue;
    if (unavailableUserIds.has(e.userId)) {
      updates.push({ ...e, response: 'NO', responseOrigin: 'SYSTEM_AVAILABILITY', reason: null, pendingSince: null });
    } else {
      invitees.push(e.userId);
    }
  }
  return { updates, invitees };
}

/**
 * Prepares an Event roster for a fresh attendance release after a date/time change (spec §30).
 * Everyone is asked again; callups who never accepted drop off and return to the pool.
 */
export function resetForNewRelease(roster: EventRosterEntry[]): { keep: EventRosterEntry[]; dropped: string[] } {
  const keep: EventRosterEntry[] = [];
  const dropped: string[] = [];
  for (const e of roster) {
    if (e.source === 'CALLUP' && e.response !== 'YES') {
      dropped.push(e.userId);
      continue;
    }
    keep.push({ ...e, response: 'NO_RESPONSE', responseOrigin: null, reason: null, pendingSince: null });
  }
  return { keep, dropped };
}

/** Manager adds a player after release without sending a request (spec §49). Must respect quantities. */
export function addWithoutAttendanceRequest(state: EventAttendanceState, entry: EventRosterEntry): EventRosterEntry {
  const candidate: EventRosterEntry = { ...entry, response: 'YES', responseOrigin: 'MANAGER', pendingSince: null, reason: null };
  if (!hasRosterSpaceFor(state.roster, candidate, state)) {
    throw new DomainError('ROSTER_FULL', 'The roster is full for this Position. Remove a player or raise the quantity first.');
  }
  return candidate;
}

/** Number of people who still owe a response, for the manager reminder (spec §54). */
export function countIncompleteAttendance(roster: EventRosterEntry[]): number {
  return roster.filter((e) => e.response === 'NO_RESPONSE').length;
}
