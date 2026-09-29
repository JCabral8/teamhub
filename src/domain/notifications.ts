import type { EventType } from './types.ts';

/**
 * Notification content (spec §55, and the "Notification Examples" in wireframes 6 and 7). A callup is
 * told it's a callup invitation; nothing reveals their ranking or pool.
 */

export type NotificationType =
  | 'EVENT_INVITATION'
  | 'ATTENDANCE_READY'
  | 'ATTENDANCE_SENT'
  | 'ATTENDANCE_DISCREPANCY'
  | 'PENDING_APPROVAL'
  | 'ROSTER_SPOT_CONFIRMED'
  | 'CALLUP_ACCEPTED'
  | 'CALLUP_DECLINED'
  | 'EVENT_DATE_CHANGED'
  | 'EVENT_TIME_CHANGED'
  | 'MEMBERSHIP_REQUEST'
  | 'MANAGER_SUCCESSION'
  | 'ATTENDANCE_REMINDER'
  | 'CALLUP_INVITATION'
  | 'CALLUP_CONFIRMED'
  | 'CALLUP_NO_LONGER_NEEDED'
  | 'NOT_SELECTED'
  | 'NEW_EVENT';

export interface NotificationContent {
  type: NotificationType;
  title: string;
  body: string;
}

export interface EventSummary {
  type: EventType;
  name: string | null;
  opponent: string | null;
  startsAt: Date;
  timezone: string;
}

const TYPE_LABELS: Record<EventType, string> = {
  GAME: 'Game',
  PRACTICE: 'Practice',
  TOURNAMENT: 'Tournament',
  SOCIAL: 'Social',
  MEETING: 'Meeting',
  CUSTOM: 'Event',
};

export function eventLabel(e: Pick<EventSummary, 'type' | 'name' | 'opponent'>): string {
  if (e.name?.trim()) return e.name.trim();
  const base = TYPE_LABELS[e.type];
  return e.opponent?.trim() ? `${base} vs ${e.opponent.trim()}` : base;
}

export function formatEventTime(startsAt: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(startsAt);
}

const heading = (e: EventSummary) => `${eventLabel(e)} · ${formatEventTime(e.startsAt, e.timezone)}`;

/** The attendance request default-roster players receive. */
export function eventInvitation(e: EventSummary): NotificationContent {
  return { type: 'EVENT_INVITATION', title: heading(e), body: 'Are you attending? Tap to respond.' };
}

export function attendanceReady(e: EventSummary): NotificationContent {
  return {
    type: 'ATTENDANCE_READY',
    title: 'Attendance is ready to send.',
    body: `Attendance for ${heading(e)} has NOT been sent yet. Send now or schedule it for later.`,
  };
}

export function attendanceSent(e: EventSummary): NotificationContent {
  return { type: 'ATTENDANCE_SENT', title: 'Attendance Sent', body: `Players have been notified for ${heading(e)}.` };
}

export function attendanceDiscrepancy(e: EventSummary, playerName: string): NotificationContent {
  return {
    type: 'ATTENDANCE_DISCREPANCY',
    title: 'Roster discrepancy',
    body: `${playerName} wants to attend ${heading(e)} but the roster is full. Approve or decline them on the Event roster.`,
  };
}

export function pendingApproval(e: EventSummary): NotificationContent {
  return {
    type: 'PENDING_APPROVAL',
    title: heading(e),
    body: "The roster is full, so you're on the waitlist. You'll be notified if a spot becomes available.",
  };
}

export function rosterSpotConfirmed(e: EventSummary): NotificationContent {
  return { type: 'ROSTER_SPOT_CONFIRMED', title: "You're In!", body: `A spot became available and you've been added to the roster for ${heading(e)}.` };
}

export function notSelected(e: EventSummary): NotificationContent {
  return { type: 'NOT_SELECTED', title: 'Not Selected', body: `A spot did not become available for ${heading(e)}. Your status is Not Attending.` };
}

export function callupInvitation(e: EventSummary): NotificationContent {
  return { type: 'CALLUP_INVITATION', title: 'Callup Opportunity', body: `You've been invited as a callup for ${heading(e)}. Tap to respond.` };
}

export function callupConfirmed(e: EventSummary): NotificationContent {
  return { type: 'CALLUP_CONFIRMED', title: 'Callup Confirmed', body: `You've been added as a callup for ${heading(e)}.` };
}

export function callupNoLongerNeeded(e: EventSummary): NotificationContent {
  return {
    type: 'CALLUP_NO_LONGER_NEEDED',
    title: 'Callup No Longer Needed',
    body: `The callup opportunity for ${heading(e)} has been filled. Thanks for being available!`,
  };
}

export function newEvent(e: EventSummary, location: string | null): NotificationContent {
  return { type: 'NEW_EVENT', title: 'New Event', body: [heading(e), location].filter(Boolean).join(' · ') };
}

export function callupAccepted(e: EventSummary, playerName: string): NotificationContent {
  return { type: 'CALLUP_ACCEPTED', title: heading(e), body: `${playerName} accepted and is attending.` };
}

export function callupDeclined(e: EventSummary, playerName: string): NotificationContent {
  return { type: 'CALLUP_DECLINED', title: heading(e), body: `${playerName} declined.` };
}

export function eventDateChanged(e: EventSummary): NotificationContent {
  return { type: 'EVENT_DATE_CHANGED', title: 'Event date changed', body: `${eventLabel(e)} is now ${formatEventTime(e.startsAt, e.timezone)}.` };
}

export function eventTimeChanged(e: EventSummary): NotificationContent {
  return { type: 'EVENT_TIME_CHANGED', title: 'Event time changed', body: `${eventLabel(e)} is now ${formatEventTime(e.startsAt, e.timezone)}.` };
}

export function membershipRequest(teamName: string, playerName: string): NotificationContent {
  return { type: 'MEMBERSHIP_REQUEST', title: teamName, body: `${playerName} asked to join the team.` };
}

export function managerSuccession(teamName: string, newManagerName: string): NotificationContent {
  return { type: 'MANAGER_SUCCESSION', title: teamName, body: `${newManagerName} is now the Team Manager.` };
}

export function attendanceReminder(e: EventSummary, incomplete: number): NotificationContent {
  const who = incomplete === 1 ? '1 person has' : `${incomplete} people have`;
  return { type: 'ATTENDANCE_REMINDER', title: heading(e), body: `${who} not completed their attendance.` };
}
