// Core domain vocabulary shared by the app, the server services and the tests.
// Business rules live in the sibling modules; this file only defines shapes.

export const ATTENDANCE_RESPONSES = ['YES', 'NO', 'NO_RESPONSE'] as const;
export type AttendanceResponse = (typeof ATTENDANCE_RESPONSES)[number];

/** Responses a person can actively choose. NO_RESPONSE is only ever the initial state. */
export type AttendanceAnswer = Exclude<AttendanceResponse, 'NO_RESPONSE'>;

export const DECLINE_REASON_MAX_LENGTH = 75;

export type ManagerRole = 'MANAGER' | 'ASSISTANT_MANAGER';

export type MembershipStatus = 'PENDING' | 'ACTIVE' | 'DECLINED' | 'REMOVED';

/** Whether a team member is on the default roster, a callup, or neither (e.g. a non-playing manager). */
export type RosterRole = 'ROSTER' | 'CALLUP' | 'NONE';

export type PositionKind = 'BASE' | 'GOALIE' | 'HYBRID';

export interface TeamPosition {
  id: string;
  name: string;
  kind: PositionKind;
  /** Base Position ids a HYBRID is composed of. Empty for BASE and GOALIE. */
  componentIds: string[];
  sortOrder: number;
}

export interface PositionConfig {
  positions: TeamPosition[];
  goalieEnabled: boolean;
}

export interface RosterRequirement {
  /** A BASE or GOALIE Position id. Hybrids never carry requirements. */
  positionId: string;
  quantity: number;
}

export type CallupMode = 'BASIC' | 'ADVANCED';
export type CallupSelectionMethod = 'RANDOMIZED_ROTATION' | 'PREDETERMINED_SEQUENCE';
export type AttendanceMode = 'AUTOMATIC' | 'MANUAL';

export const EVENT_TYPES = ['GAME', 'PRACTICE', 'TOURNAMENT', 'SOCIAL', 'MEETING', 'CUSTOM'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** How a person came to be on an Event roster. */
export type RosterSource = 'ROSTER' | 'CALLUP' | 'MANAGER_ADDED';

/** Who produced the current response. SYSTEM_AVAILABILITY marks an automatic NO from an unavailable date. */
export type ResponseOrigin = 'PLAYER' | 'SYSTEM_AVAILABILITY' | 'MANAGER';

export interface EventRosterEntry {
  userId: string;
  displayName: string;
  source: RosterSource;
  /** Official team Position at the time of the snapshot. Manager-only information. */
  positionId: string | null;
  response: AttendanceResponse;
  responseOrigin: ResponseOrigin | null;
  reason: string | null;
  /** Set while a YES is waiting for a roster spot (PENDING APPROVAL). ISO timestamp, used first-come-first-served. */
  pendingSince: string | null;
}

export type RosterStanding = 'ATTENDING' | 'PENDING_APPROVAL' | 'NO_RESPONSE' | 'NOT_ATTENDING';

export interface TeamAttendanceSettings {
  timezone: string;
  attendanceMode: AttendanceMode;
  releaseDaysBefore: number;
  /** Team-local wall-clock time, HH:MM (24h). */
  releaseTime: string;
  reminderEnabled: boolean;
  reminderHoursBefore: number;
}

export const DEFAULT_ATTENDANCE_SETTINGS: Omit<TeamAttendanceSettings, 'timezone'> = {
  attendanceMode: 'AUTOMATIC',
  releaseDaysBefore: 2,
  releaseTime: '18:00',
  reminderEnabled: true,
  reminderHoursBefore: 12,
};

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
