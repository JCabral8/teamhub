// The command API: every client write goes through one of these, validated and authorized server-side.
import { EVENT_TYPES, type RosterRole } from '../domain/index.ts';
import * as attendance from './attendance.ts';
import type { CommandContext } from './db.ts';
import * as events from './events.ts';
import * as stats from './statistics.ts';
import * as teams from './teams.ts';
import * as v from './validate.ts';
import type { Params } from './validate.ts';

const ROSTER_ROLES = ['ROSTER', 'CALLUP', 'NONE'] as const satisfies readonly RosterRole[];

function requirementList(p: Params) {
  return v.list(p, 'requirements').map((r) => ({ positionId: v.uuid(r as Params, 'positionId'), quantity: v.int(r as Params, 'quantity', 0, 99) }));
}

function eventFields(p: Params) {
  return {
    type: v.oneOf(p, 'type', EVENT_TYPES),
    name: v.text(p, 'name', { max: 80, optional: true }),
    opponent: v.text(p, 'opponent', { max: 80, optional: true }),
    location: v.text(p, 'location', { max: 200, optional: true }),
    notes: v.text(p, 'notes', { max: 1000, optional: true }),
  };
}

type Handler = (ctx: CommandContext, p: Params) => Promise<unknown>;

export const commands: Record<string, Handler> = {
  // Teams and membership (Phase 2)
  createTeam: (ctx, p) =>
    teams.createTeam(ctx, {
      name: v.text(p, 'name', { max: 80 }),
      timezone: v.text(p, 'timezone', { max: 64 }),
      arena: v.text(p, 'arena', { max: 120, optional: true }),
      defaultLocation: v.text(p, 'defaultLocation', { max: 200, optional: true }),
      rosterRole: v.has(p, 'rosterRole') ? v.oneOf(p, 'rosterRole', ROSTER_ROLES) : 'NONE',
    }),
  updateTeamSettings: (ctx, p) =>
    teams.updateTeamSettings(ctx, v.uuid(p, 'teamId'), {
      ...(v.has(p, 'name') && { name: v.text(p, 'name', { max: 80 }) }),
      ...(v.has(p, 'timezone') && { timezone: v.text(p, 'timezone', { max: 64 }) }),
      ...(v.has(p, 'arena') && { arena: v.text(p, 'arena', { max: 120, optional: true }) }),
      ...(v.has(p, 'defaultLocation') && { defaultLocation: v.text(p, 'defaultLocation', { max: 200, optional: true }) }),
      ...(v.has(p, 'attendanceMode') && { attendanceMode: v.oneOf(p, 'attendanceMode', ['AUTOMATIC', 'MANUAL'] as const) }),
      ...(v.has(p, 'releaseDaysBefore') && { releaseDaysBefore: v.int(p, 'releaseDaysBefore', 0, 30) }),
      ...(v.has(p, 'releaseTime') && { releaseTime: v.clockTime(p, 'releaseTime') }),
      ...(v.has(p, 'reminderEnabled') && { reminderEnabled: v.bool(p, 'reminderEnabled') }),
      ...(v.has(p, 'reminderHoursBefore') && { reminderHoursBefore: v.int(p, 'reminderHoursBefore', 1, 168) }),
      ...(v.has(p, 'callupMode') && { callupMode: v.oneOf(p, 'callupMode', ['BASIC', 'ADVANCED'] as const) }),
      ...(v.has(p, 'callupSelectionMethod') && {
        callupSelectionMethod: v.oneOf(p, 'callupSelectionMethod', ['RANDOMIZED_ROTATION', 'PREDETERMINED_SEQUENCE'] as const),
      }),
    }),
  regenerateJoinCode: (ctx, p) => teams.regenerateJoinCode(ctx, v.uuid(p, 'teamId')),
  requestToJoin: (ctx, p) => teams.requestToJoin(ctx, v.text(p, 'joinCode', { max: 64 })),
  approveMember: (ctx, p) =>
    teams.approveMember(ctx, v.uuid(p, 'membershipId'), v.uuid(p, 'positionId'), v.oneOf(p, 'rosterRole', ROSTER_ROLES)),
  declineMember: (ctx, p) => teams.declineMember(ctx, v.uuid(p, 'membershipId')),
  setMemberPosition: (ctx, p) => teams.setMemberPosition(ctx, v.uuid(p, 'membershipId'), v.uuid(p, 'positionId')),
  setMemberRosterRole: (ctx, p) => teams.setMemberRosterRole(ctx, v.uuid(p, 'membershipId'), v.oneOf(p, 'rosterRole', ROSTER_ROLES)),
  removeMember: (ctx, p) => teams.removeMember(ctx, v.uuid(p, 'membershipId')),
  leaveTeam: (ctx, p) => teams.leaveTeam(ctx, v.uuid(p, 'teamId')),
  assignAssistant: (ctx, p) => teams.assignAssistant(ctx, v.uuid(p, 'membershipId')),
  removeAssistant: (ctx, p) => teams.removeAssistant(ctx, v.uuid(p, 'membershipId')),
  transferManager: (ctx, p) => teams.transferManager(ctx, v.uuid(p, 'membershipId')),
  deleteTeam: (ctx, p) => teams.deleteTeam(ctx, v.uuid(p, 'teamId')),

  // Positions and Default Roster (Phase 3)
  createPosition: (ctx, p) => teams.createPosition(ctx, v.uuid(p, 'teamId'), v.text(p, 'name', { max: 40 })),
  createHybridPosition: (ctx, p) => teams.createHybridPosition(ctx, v.uuid(p, 'teamId'), v.uuidList(p, 'componentIds')),
  configureGoalie: (ctx, p) =>
    teams.configureGoalie(ctx, v.uuid(p, 'teamId'), {
      ...(v.has(p, 'enabled') && { enabled: v.bool(p, 'enabled') }),
      ...(v.has(p, 'name') && { name: v.text(p, 'name', { max: 40 }) }),
    }),
  deletePosition: (ctx, p) => teams.deletePosition(ctx, v.uuid(p, 'positionId')),
  setDefaultRoster: (ctx, p) => teams.setDefaultRoster(ctx, v.uuid(p, 'teamId'), requirementList(p)),
  setCallupPoolOrder: (ctx, p) =>
    teams.setCallupPoolOrder(ctx, v.uuid(p, 'teamId'), v.text(p, 'poolKey', { max: 64 }), v.uuidList(p, 'userIds')),

  // Events (Phase 4)
  createEvent: (ctx, p) => events.createEvent(ctx, v.uuid(p, 'teamId'), { ...eventFields(p), startsAt: v.isoInstant(p, 'startsAt') }),
  createEvents: (ctx, p) => {
    const dates = v.list(p, 'dates');
    return events.createEvents(
      ctx,
      v.uuid(p, 'teamId'),
      eventFields(p),
      v.clockTime(p, 'time'),
      dates.map((date) => v.localDateField({ dates: date }, 'dates')),
    );
  },
  updateEvent: (ctx, p) =>
    events.updateEvent(ctx, v.uuid(p, 'eventId'), {
      ...(v.has(p, 'type') && { type: v.oneOf(p, 'type', EVENT_TYPES) }),
      ...(v.has(p, 'name') && { name: v.text(p, 'name', { max: 80, optional: true }) }),
      ...(v.has(p, 'opponent') && { opponent: v.text(p, 'opponent', { max: 80, optional: true }) }),
      ...(v.has(p, 'location') && { location: v.text(p, 'location', { max: 200, optional: true }) }),
      ...(v.has(p, 'notes') && { notes: v.text(p, 'notes', { max: 1000, optional: true }) }),
      ...(v.has(p, 'startsAt') && { startsAt: v.isoInstant(p, 'startsAt') }),
    }),
  deleteEvent: (ctx, p) => events.deleteEvent(ctx, v.uuid(p, 'eventId')),
  setEventRequirements: (ctx, p) => attendance.setEventRequirements(ctx, v.uuid(p, 'eventId'), requirementList(p)),
  addEventPlayer: (ctx, p) =>
    attendance.addEventPlayer(ctx, v.uuid(p, 'eventId'), v.uuid(p, 'membershipId'), v.bool(p, 'sendAttendanceRequest')),
  removeEventPlayer: (ctx, p) => attendance.removeEventPlayer(ctx, v.uuid(p, 'eventId'), v.uuid(p, 'userId')),

  // Attendance (Phase 5)
  sendAttendanceNow: (ctx, p) => attendance.sendAttendanceNow(ctx, v.uuid(p, 'eventId')),
  scheduleAttendance: (ctx, p) =>
    attendance.scheduleAttendanceLater(ctx, v.uuid(p, 'eventId'), v.localDateField(p, 'date'), v.clockTime(p, 'time')),
  holdAttendance: (ctx, p) => attendance.holdAttendance(ctx, v.uuid(p, 'eventId')),
  respondAttendance: (ctx, p) =>
    attendance.respondAttendance(
      ctx,
      v.uuid(p, 'eventId'),
      v.oneOf(p, 'response', ['YES', 'NO'] as const),
      v.has(p, 'reason') && typeof p.reason === 'string' ? p.reason : null,
    ),

  // Callups (Phase 6)
  closeCallupInvitation: (ctx, p) => attendance.closeCallupInvitation(ctx, v.uuid(p, 'eventId'), v.uuid(p, 'userId')),
  runCallupSelection: (ctx, p) => attendance.runCallupSelection(ctx, v.uuid(p, 'eventId')),

  // Statistics (Phase 7)
  getAttendanceStatistics: (ctx, p) => stats.getAttendanceStatistics(ctx, v.uuid(p, 'teamId')),
};

export type CommandName = keyof typeof commands;
