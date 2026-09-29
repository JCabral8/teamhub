// Spec §61 scenarios 1–14, 19–29, 33–35 against the real schema and services.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { groupRosterByPosition } from '../../src/domain/index.ts';
import { loadEventContext } from '../../src/server/load.ts';
import {
  DEFAULT_NOW,
  TZ,
  addMember,
  buildTeam,
  createGame,
  createHarness,
  everyoneYes,
  notificationsFor,
  openInvites,
  releasedGame,
  rosterRow,
  type Harness,
} from './harness.ts';
import { zonedToUtc } from '../../src/domain/index.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(() => h.setNow(DEFAULT_NOW));

describe('Responses (#1–#3)', () => {
  it('#1 player selects Yes', async () => {
    const t = await buildTeam(h);
    const eventId = await releasedGame(h, t);
    const res = await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'YES' });
    expect(res).toEqual({ standing: 'ATTENDING' });
    expect(await rosterRow(h, eventId, t.players.F1.userId)).toMatchObject({ response: 'YES', response_origin: 'PLAYER', pending_since: null });
  });

  it('answering marks the attendance request notification read', async () => {
    const t = await buildTeam(h);
    const eventId = await releasedGame(h, t);
    const unreadInvites = (userId: string) =>
      h.sql`select id from public.notifications where user_id = ${userId} and event_id = ${eventId} and type = 'EVENT_INVITATION' and read_at is null`;
    expect(await unreadInvites(t.players.F1.userId)).toHaveLength(1);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'YES' });
    expect(await unreadInvites(t.players.F1.userId)).toHaveLength(0);
    expect(await unreadInvites(t.players.F2.userId)).toHaveLength(1);
  });

  it('#2 player selects No with a reason of at most 75 characters', async () => {
    const t = await buildTeam(h);
    const eventId = await releasedGame(h, t);
    expect(await h.fail(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO', reason: 'x'.repeat(76) })).toBe('REASON_TOO_LONG');
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO', reason: 'Work trip' });
    expect(await rosterRow(h, eventId, t.players.F1.userId)).toMatchObject({ response: 'NO', reason: 'Work trip' });
  });

  it('#3 player leaves No Response', async () => {
    const t = await buildTeam(h);
    const eventId = await releasedGame(h, t);
    expect((await rosterRow(h, eventId, t.players.F1.userId)).response).toBe('NO_RESPONSE');
    expect(await notificationsFor(h, t.players.F1.userId, 'EVENT_INVITATION')).toHaveLength(1);
  });

  it('players cannot answer before attendance is sent', async () => {
    const t = await buildTeam(h);
    const { eventId } = await createGame(h, t);
    expect(await h.fail(t.players.F1.userId, 'respondAttendance', { eventId, response: 'YES' })).toBe('ATTENDANCE_NOT_RELEASED');
  });
});

describe('Attendance changes and Pending Approval (#4–#8)', () => {
  it('#4 Yes → No opens a spot; the Manager is offered a callup for it and invites them', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    expect((await h.run(t.managerId, 'getCallupCandidates', { eventId })).spots).toBe(0);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    // Nothing is invited automatically (wireframes 3, 8).
    expect(await openInvites(h, eventId)).toEqual([]);
    const plan = await h.run(t.managerId, 'getCallupCandidates', { eventId });
    expect(plan.spots).toBe(1);
    expect(plan.candidates).toEqual([expect.objectContaining({ userId: t.players.CF1.userId, suggested: true, onEvent: false })]);
    await h.run(t.managerId, 'inviteCallups', { eventId, userIds: [t.players.CF1.userId] });
    expect((await openInvites(h, eventId)).map((i) => i.user_id)).toEqual([t.players.CF1.userId]);
    expect(await notificationsFor(h, t.players.CF1.userId, 'CALLUP_INVITATION')).toHaveLength(1);
  });

  it('#5 No → Yes with space restores the player immediately', async () => {
    const t = await buildTeam(h);
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    const res = await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'YES' });
    expect(res.standing).toBe('ATTENDING');
  });

  it('#6 No → Yes without space goes to Pending Approval and Managers hear about the discrepancy', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.managerId, 'runCallupSelection', { eventId });
    await h.run(t.players.CF1.userId, 'respondAttendance', { eventId, response: 'YES' });
    expect(await h.run(t.players.F1.userId, 'previewAttendance', { eventId })).toEqual({ rosterFull: true });
    const res = await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'YES' });
    expect(res.standing).toBe('PENDING_APPROVAL');
    expect((await rosterRow(h, eventId, t.players.F1.userId)).pending_since).not.toBeNull();
    expect(await notificationsFor(h, t.players.F1.userId, 'PENDING_APPROVAL')).toHaveLength(1);
    expect(await notificationsFor(h, t.managerId, 'ATTENDANCE_DISCREPANCY')).toHaveLength(1);
  });

  it('#7 a Manager approves a pending player, who is told they are in (wireframe 4D, 4E)', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.managerId, 'runCallupSelection', { eventId });
    await h.run(t.players.CF1.userId, 'respondAttendance', { eventId, response: 'YES' });
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'YES' });

    // A spot opening does not promote anyone on its own.
    await h.run(t.players.F2.userId, 'respondAttendance', { eventId, response: 'NO' });
    expect((await rosterRow(h, eventId, t.players.F1.userId)).pending_since).not.toBeNull();

    expect(await h.fail(t.players.F3.userId, 'approvePendingPlayer', { eventId, userId: t.players.F1.userId })).toBe('FORBIDDEN');
    await h.run(t.managerId, 'approvePendingPlayer', { eventId, userId: t.players.F1.userId });
    expect(await rosterRow(h, eventId, t.players.F1.userId)).toMatchObject({ response: 'YES', pending_since: null });
    expect(await notificationsFor(h, t.players.F1.userId, 'ROSTER_SPOT_CONFIRMED')).toHaveLength(1);
    expect(await h.fail(t.managerId, 'approvePendingPlayer', { eventId, userId: t.players.F1.userId })).toBe('NOT_PENDING');
  });

  it('#8 a Manager declines a pending player: Not Attending and "Not Selected" (wireframe 4F)', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.managerId, 'runCallupSelection', { eventId });
    await h.run(t.players.CF1.userId, 'respondAttendance', { eventId, response: 'YES' });
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'YES' });
    await h.run(t.managerId, 'declinePendingPlayer', { eventId, userId: t.players.F1.userId });
    expect(await rosterRow(h, eventId, t.players.F1.userId)).toMatchObject({ response: 'NO', pending_since: null, response_origin: 'MANAGER' });
    expect(await notificationsFor(h, t.players.F1.userId, 'NOT_SELECTED')).toHaveLength(1);
  });

  it('Maybe holds no spot and can be changed later (wireframe 6)', async () => {
    const t = await buildTeam(h);
    const eventId = await releasedGame(h, t);
    const res = await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'MAYBE' });
    expect(res.standing).toBe('MAYBE');
    expect(await rosterRow(h, eventId, t.players.F1.userId)).toMatchObject({ response: 'MAYBE', reason: null });
    expect((await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'YES' })).standing).toBe('ATTENDING');
  });
});

describe('Callups (#9–#14)', () => {
  it('#9 a callup accepts, fills the vacancy and is told they are confirmed', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.managerId, 'inviteCallups', { eventId, userIds: [t.players.CF1.userId] });
    const res = await h.run(t.players.CF1.userId, 'respondAttendance', { eventId, response: 'YES' });
    expect(res.standing).toBe('ATTENDING');
    expect(await notificationsFor(h, t.managerId, 'CALLUP_ACCEPTED')).toHaveLength(1);
    expect(await notificationsFor(h, t.players.CF1.userId, 'CALLUP_CONFIRMED')).toHaveLength(1);
  });

  it('#10 a callup declines: the Manager is told and the next callup is suggested', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward'], ['CF2', 'Forward']], settings: { callupSelectionMethod: 'PREDETERMINED_SEQUENCE' } });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.managerId, 'runCallupSelection', { eventId });
    expect((await openInvites(h, eventId)).map((i) => i.user_id)).toEqual([t.players.CF1.userId]);
    await h.run(t.players.CF1.userId, 'respondAttendance', { eventId, response: 'NO' });
    expect(await notificationsFor(h, t.managerId, 'CALLUP_DECLINED')).toHaveLength(1);
    const plan = await h.run(t.managerId, 'getCallupCandidates', { eventId });
    expect(plan.candidates.filter((c: { suggested: boolean }) => c.suggested).map((c: { userId: string }) => c.userId)).toEqual([t.players.CF2.userId]);
    await h.run(t.managerId, 'runCallupSelection', { eventId });
    const invites = await openInvites(h, eventId);
    expect(invites.map((i) => [i.user_id, i.response])).toEqual([
      [t.players.CF1.userId, 'NO'],
      [t.players.CF2.userId, 'NO_RESPONSE'],
    ]);
    // Once the replacement accepts, the decliner cannot come back through Pending Approval.
    await h.run(t.players.CF2.userId, 'respondAttendance', { eventId, response: 'YES' });
    expect(await h.fail(t.players.CF1.userId, 'respondAttendance', { eventId, response: 'YES' })).toBe('CALLUP_SPOT_FILLED');
    expect((await rosterRow(h, eventId, t.players.CF1.userId)).pending_since).toBeNull();
  });

  it('a full roster suggests nobody; callup spots add room for callups (wireframe 2)', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward'], ['CF2', 'Forward'], ['CF3', 'Forward'], ['CD4', 'Defence']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    expect((await h.run(t.managerId, 'getCallupCandidates', { eventId })).spots).toBe(0);
    expect(await h.run(t.managerId, 'runCallupSelection', { eventId })).toEqual({ invited: 0 });

    const requirements = (await h.sql<{ positionId: string; quantity: number }[]>`
      select team_position_id as "positionId", quantity from public.event_roster_requirements where event_id = ${eventId}`).map((r) => ({ ...r }));
    await h.run(t.managerId, 'setEventRequirements', { eventId, requirements, callupSpots: 2 });
    expect((await h.run(t.managerId, 'getCallupCandidates', { eventId })).spots).toBe(2);
    await h.run(t.managerId, 'runCallupSelection', { eventId });
    const invited = (await openInvites(h, eventId)).map((i) => i.user_id);
    expect(invited).toHaveLength(2);
    for (const id of invited) expect((await h.run(id, 'respondAttendance', { eventId, response: 'YES' })).standing).toBe('ATTENDING');
  });

  it('new Events take the Team callup spots when "Always include callups" is on', async () => {
    const t = await buildTeam(h, { settings: { includeCallups: true, callupSpots: 3 } });
    const { eventId } = await createGame(h, t);
    const [{ callup_spots }] = await h.sql<{ callup_spots: number }[]>`select callup_spots from public.events where id = ${eventId}`;
    expect(callup_spots).toBe(3);
  });

  it('#11 when the Defence pool is exhausted the Forward pool is searched', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']], settings: { callupMode: 'ADVANCED' } });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.D1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.managerId, 'runCallupSelection', { eventId });
    expect(await openInvites(h, eventId)).toEqual([
      expect.objectContaining({ user_id: t.players.CF1.userId, target_position_id: t.pos.Defence, pool_key: t.pos.Forward }),
    ]);
    const res = await h.run(t.players.CF1.userId, 'respondAttendance', { eventId, response: 'YES' });
    expect(res.standing).toBe('ATTENDING');
  });

  it('a hand-picked Forward callup can fill an open Defence spot', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward'], ['CF2', 'Forward']], settings: { callupMode: 'ADVANCED' } });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.D1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.managerId, 'inviteCallups', { eventId, userIds: [t.players.CF2.userId] });
    expect(await openInvites(h, eventId)).toEqual([expect.objectContaining({ user_id: t.players.CF2.userId, target_position_id: t.pos.Defence })]);
    expect((await h.run(t.players.CF2.userId, 'respondAttendance', { eventId, response: 'YES' })).standing).toBe('ATTENDING');
  });

  it('#12 a hybrid callup satisfies the missing Position ahead of higher-ranked forwards', async () => {
    const t = await buildTeam(h, {
      callups: [['CF1', 'Forward'], ['HY1', 'Forward/Defence']],
      settings: { callupMode: 'ADVANCED', callupSelectionMethod: 'PREDETERMINED_SEQUENCE' },
    });
    await h.run(t.managerId, 'setCallupPoolOrder', { teamId: t.teamId, poolKey: t.pos.Forward, userIds: [t.players.CF1.userId, t.players.HY1.userId] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.D1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.managerId, 'runCallupSelection', { eventId });
    expect(await openInvites(h, eventId)).toEqual([expect.objectContaining({ user_id: t.players.HY1.userId, pool_key: t.pos.Defence })]);
  });

  it('#13 a missing Goalie suggests a Goalie callup, never a skater', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.G1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.managerId, 'runCallupSelection', { eventId });
    expect(await openInvites(h, eventId)).toEqual([]);

    const t2 = await buildTeam(h, { callups: [['CF1', 'Forward'], ['CG1', 'Goalie']] });
    const e2 = await releasedGame(h, t2);
    await everyoneYes(h, t2, e2);
    await h.run(t2.players.G1.userId, 'respondAttendance', { eventId: e2, response: 'NO' });
    await h.run(t2.managerId, 'runCallupSelection', { eventId: e2 });
    expect((await openInvites(h, e2)).map((i) => i.user_id)).toEqual([t2.players.CG1.userId]);
  });

  it('#14 with Goalie disabled a missing Goalie creates no need and goalies count as players', async () => {
    const t = await buildTeam(h, { callups: [['CG1', 'Goalie']] });
    await h.run(t.managerId, 'configureGoalie', { teamId: t.teamId, enabled: false });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId, ['G1']);
    await h.run(t.players.G1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.managerId, 'runCallupSelection', { eventId });
    expect(await openInvites(h, eventId)).toEqual([]);
    // Re-enabling brings Goalie logic back.
    await h.run(t.managerId, 'configureGoalie', { teamId: t.teamId, enabled: true, name: 'Keeper' });
    await h.run(t.managerId, 'runCallupSelection', { eventId });
    expect((await openInvites(h, eventId)).map((i) => i.user_id)).toEqual([t.players.CG1.userId]);
  });

  it('Managers set a callup to Accepted, Declined or Pending by hand (wireframe 3E)', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.managerId, 'inviteCallups', { eventId, userIds: [t.players.CF1.userId] });
    await h.run(t.managerId, 'setCallupResponse', { eventId, userId: t.players.CF1.userId, response: 'YES' });
    expect(await rosterRow(h, eventId, t.players.CF1.userId)).toMatchObject({ response: 'YES', response_origin: 'MANAGER' });
    expect((await openInvites(h, eventId))[0].response).toBe('YES');
    await h.run(t.managerId, 'setCallupResponse', { eventId, userId: t.players.CF1.userId, response: 'NO_RESPONSE' });
    expect((await rosterRow(h, eventId, t.players.CF1.userId)).response).toBe('NO_RESPONSE');
    expect(await h.fail(t.managerId, 'setCallupResponse', { eventId, userId: t.players.F2.userId, response: 'YES' })).toBe('NOT_A_CALLUP');
  });

  it('removing a callup from the list tells them they are no longer needed (wireframes 3F, 7)', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.managerId, 'inviteCallups', { eventId, userIds: [t.players.CF1.userId] });
    await h.run(t.managerId, 'removeEventPlayer', { eventId, userId: t.players.CF1.userId });
    expect(await openInvites(h, eventId)).toEqual([]);
    expect(await notificationsFor(h, t.players.CF1.userId, 'CALLUP_NO_LONGER_NEEDED')).toHaveLength(1);
    // Only players on the callup list can be invited as callups.
    expect(await h.fail(t.managerId, 'inviteCallups', { eventId, userIds: [t.players.F2.userId] })).toBe('NOT_A_CALLUP');
  });
});

describe('Manager additions (#19)', () => {
  it('#19 adding after release: with a request, or directly while respecting quantities', async () => {
    const t = await buildTeam(h);
    const extra = await addMember(h, t, 'Late Larry', 'Forward', 'NONE');
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    expect(
      await h.fail(t.managerId, 'addEventPlayer', { eventId, membershipId: extra.membershipId, sendAttendanceRequest: false }),
    ).toBe('ROSTER_FULL');
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.managerId, 'addEventPlayer', { eventId, membershipId: extra.membershipId, sendAttendanceRequest: false });
    expect(await rosterRow(h, eventId, extra.userId)).toMatchObject({ response: 'YES', response_origin: 'MANAGER', source: 'MANAGER_ADDED' });
    expect(await notificationsFor(h, extra.userId, 'EVENT_INVITATION')).toHaveLength(0);

    const other = await releasedGame(h, t, { date: '2026-10-17' });
    await h.run(t.managerId, 'addEventPlayer', { eventId: other, membershipId: extra.membershipId, sendAttendanceRequest: true });
    expect((await rosterRow(h, other, extra.userId)).response).toBe('NO_RESPONSE');
    expect(await notificationsFor(h, extra.userId, 'EVENT_INVITATION')).toHaveLength(1);
  });
});

describe('Releasing attendance (#20–#24)', () => {
  it('#20 automatic mode releases at 6 PM Team time two days before', async () => {
    const t = await buildTeam(h);
    const { eventId } = await createGame(h, t);
    const [e] = await h.sql`select release_state, release_action, release_at from public.events where id = ${eventId}`;
    expect(e).toMatchObject({ release_state: 'SCHEDULED', release_action: 'RELEASE', release_at: zonedToUtc('2026-10-08', '18:00', TZ) });

    h.setNow('2026-10-08T21:59:00Z');
    expect((await h.jobs()).released).not.toContain(eventId);
    h.setNow('2026-10-08T22:00:00Z');
    expect((await h.jobs()).released).toContain(eventId);
    expect(await notificationsFor(h, t.players.F1.userId, 'EVENT_INVITATION')).toHaveLength(1);
    expect(await notificationsFor(h, t.managerId, 'ATTENDANCE_SENT')).toHaveLength(1);
  });

  it('#21 manual mode only tells Managers attendance is ready, and sends nothing', async () => {
    const t = await buildTeam(h, { settings: { attendanceMode: 'MANUAL' } });
    const { eventId } = await createGame(h, t);
    h.setNow('2026-10-08T22:00:00Z');
    expect((await h.jobs()).readyNotified).toContain(eventId);
    const [ready] = await notificationsFor(h, t.managerId, 'ATTENDANCE_READY');
    expect(ready.title).toBe('Attendance is ready to send.');
    expect(ready.body).toMatch(/NOT been sent/);
    expect(await notificationsFor(h, t.players.F1.userId, 'EVENT_INVITATION')).toHaveLength(0);
    const [e] = await h.sql`select release_state from public.events where id = ${eventId}`;
    expect(e.release_state).toBe('UNSENT');
  });

  it('#22 Schedule Later releases at the chosen Team-local time', async () => {
    const t = await buildTeam(h, { settings: { attendanceMode: 'MANUAL' } });
    const { eventId } = await createGame(h, t);
    expect(await h.fail(t.managerId, 'scheduleAttendance', { eventId, date: '2026-10-11', time: '18:00' })).toBe('SCHEDULE_DATE_INVALID');
    await h.run(t.managerId, 'scheduleAttendance', { eventId, date: '2026-10-05', time: '19:00' });
    h.setNow(zonedToUtc('2026-10-05', '18:59', TZ));
    expect((await h.jobs()).released).not.toContain(eventId);
    h.setNow(zonedToUtc('2026-10-05', '19:00', TZ));
    expect((await h.jobs()).released).toContain(eventId);
  });

  it('#23 Send Now releases immediately', async () => {
    const t = await buildTeam(h);
    const { eventId } = await createGame(h, t);
    await h.run(t.managerId, 'sendAttendanceNow', { eventId });
    const [e] = await h.sql`select release_state, release_at from public.events where id = ${eventId}`;
    expect(e).toMatchObject({ release_state: 'RELEASED', release_at: null });
    expect(await h.fail(t.managerId, 'sendAttendanceNow', { eventId })).toBe('ALREADY_RELEASED');
  });

  it('#24 an Event created after the normal release time asks first and sends nothing', async () => {
    const t = await buildTeam(h);
    h.setNow('2026-10-09T12:00:00Z');
    const created = await createGame(h, t);
    expect(created.releaseDecisionRequired).toBe(true);
    await h.run(t.managerId, 'holdAttendance', { eventId: created.eventId });
    expect((await h.jobs()).released).not.toContain(created.eventId);
    expect(await notificationsFor(h, t.players.F1.userId, 'EVENT_INVITATION')).toHaveLength(0);
  });
});

describe('Event changes after release (#25–#28)', () => {
  it('#25 changing the date needs a new release: responses reset and players are told', async () => {
    const t = await buildTeam(h);
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    const res = await h.run(t.managerId, 'updateEvent', { eventId, startsAt: zonedToUtc('2026-10-11', '21:30', TZ).toISOString() });
    expect(res.warning).toBe('The Event date/time has changed. A new attendance request will need to be sent.');
    const [e] = await h.sql`select release_state from public.events where id = ${eventId}`;
    expect(e.release_state).toBe('SCHEDULED');
    expect((await rosterRow(h, eventId, t.players.F1.userId)).response).toBe('NO_RESPONSE');
    expect(await notificationsFor(h, t.players.F1.userId, 'EVENT_DATE_CHANGED')).toHaveLength(1);
  });

  it('#26 changing the time needs a new release', async () => {
    const t = await buildTeam(h);
    const eventId = await releasedGame(h, t);
    const res = await h.run(t.managerId, 'updateEvent', { eventId, startsAt: zonedToUtc('2026-10-10', '20:00', TZ).toISOString() });
    expect(res.warning).not.toBeNull();
    expect(await notificationsFor(h, t.players.F1.userId, 'EVENT_TIME_CHANGED')).toHaveLength(1);
  });

  it('#27 #28 changing opponent or location keeps attendance as is', async () => {
    const t = await buildTeam(h);
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    const res = await h.run(t.managerId, 'updateEvent', { eventId, opponent: 'Bears', location: 'Rink 2', notes: 'Dark jerseys' });
    expect(res.warning).toBeNull();
    const [e] = await h.sql`select release_state, opponent, location from public.events where id = ${eventId}`;
    expect(e).toMatchObject({ release_state: 'RELEASED', opponent: 'Bears', location: 'Rink 2' });
    expect((await rosterRow(h, eventId, t.players.F1.userId)).response).toBe('YES');
  });
});

describe('Availability (#29)', () => {
  it('#29 an unavailable date turns into an automatic, system-flagged No at release', async () => {
    const t = await buildTeam(h);
    await h.asUser(t.players.F1.userId, (tx) => tx`insert into public.availability_blocks (start_date, end_date) values ('2026-10-10', '2026-10-10')`);
    const eventId = await releasedGame(h, t);
    expect(await rosterRow(h, eventId, t.players.F1.userId)).toMatchObject({ response: 'NO', response_origin: 'SYSTEM_AVAILABILITY' });
    expect(await notificationsFor(h, t.players.F1.userId, 'EVENT_INVITATION')).toHaveLength(0);
    // They can still change their mind.
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'YES' });
    expect((await rosterRow(h, eventId, t.players.F1.userId)).response).toBe('YES');
  });
});

describe('Wireframe extras', () => {
  it('Events take an optional end time and Home/Away; moving the start keeps the length', async () => {
    const t = await buildTeam(h);
    const startsAt = zonedToUtc('2026-10-10', '18:00', TZ);
    const endsAt = zonedToUtc('2026-10-10', '20:00', TZ);
    const { eventId } = await h.run(t.managerId, 'createEvent', {
      teamId: t.teamId,
      type: 'GAME',
      opponent: 'Bulldogs',
      homeAway: 'HOME',
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      notifyPlayers: false,
    });
    const row = async () => (await h.sql<{ ends_at: Date; home_away: string }[]>`select ends_at, home_away from public.events where id = ${eventId}`)[0];
    expect(await row()).toEqual({ ends_at: endsAt, home_away: 'HOME' });
    await h.run(t.managerId, 'updateEvent', { eventId, startsAt: zonedToUtc('2026-10-10', '19:00', TZ).toISOString() });
    expect((await row()).ends_at).toEqual(zonedToUtc('2026-10-10', '21:00', TZ));
    expect(
      await h.fail(t.managerId, 'createEvent', { teamId: t.teamId, type: 'PRACTICE', startsAt: endsAt.toISOString(), endsAt: startsAt.toISOString() }),
    ).toBe('INVALID_END_TIME');

    const [bulk] = await h.run(t.managerId, 'createEvents', {
      teamId: t.teamId,
      type: 'PRACTICE',
      time: '23:00',
      endTime: '00:30',
      dates: ['2026-10-12'],
      notifyPlayers: false,
    });
    const [{ ends_at }] = await h.sql<{ ends_at: Date }[]>`select ends_at from public.events where id = ${bulk.eventId}`;
    expect(ends_at).toEqual(zonedToUtc('2026-10-13', '00:30', TZ));
  });

  it('players hear about a new Event unless the Manager turns it off (wireframes 5D, 6A)', async () => {
    const t = await buildTeam(h);
    await createGame(h, t, { notifyPlayers: true });
    expect(await notificationsFor(h, t.players.F1.userId, 'NEW_EVENT')).toEqual([
      expect.objectContaining({ title: 'New Event', body: expect.stringMatching(/Game vs Sharks .*Civic Arena/) }),
    ]);
    await h.run(t.managerId, 'createEvents', { teamId: t.teamId, type: 'PRACTICE', time: '19:00', dates: ['2026-10-12', '2026-10-13'] });
    const notes = await notificationsFor(h, t.players.F1.userId, 'NEW_EVENT');
    expect(notes).toHaveLength(2);
    expect(notes[1].body).toMatch(/and 1 more date/);
    await h.run(t.managerId, 'updateTeamSettings', { teamId: t.teamId, notifyNewEvents: false });
    await h.run(t.managerId, 'createEvent', { teamId: t.teamId, type: 'PRACTICE', startsAt: zonedToUtc('2026-10-14', '19:00', TZ).toISOString() });
    expect(await notificationsFor(h, t.players.F1.userId, 'NEW_EVENT')).toHaveLength(2);
  });

  it('people can save a phone number and a reason for unavailable dates (wireframes 13, 4a)', async () => {
    const t = await buildTeam(h);
    const me = t.players.F1.userId;
    await h.asUser(me, (tx) => tx`update public.profiles set phone = '555-123-4567' where id = ${me}`);
    await h.asUser(me, (tx) => tx`insert into public.availability_blocks (start_date, end_date, reason) values ('2026-10-20', '2026-10-22', 'Vacation')`);
    const [{ phone }] = await h.sql<{ phone: string }[]>`select phone from public.profiles where id = ${me}`;
    const [{ reason }] = await h.sql<{ reason: string }[]>`select reason from public.availability_blocks where user_id = ${me}`;
    expect({ phone, reason }).toEqual({ phone: '555-123-4567', reason: 'Vacation' });
  });
});

describe('Roster display (#33–#35)', () => {
  it('#33 #34 #35 Position counts are attending players; decliners stay in their group at the bottom', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward'], ['CF2', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId, ['F5', 'F6']);
    await h.run(t.players.F5.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.players.F6.userId, 'respondAttendance', { eventId, response: 'NO' });
    const ec = await h.sql.begin((tx) => loadEventContext(tx, eventId, false));
    const forward = groupRosterByPosition(ec.roster, ec.config).find((g) => g.name === 'Forward')!;
    expect(forward.count).toBe(4);
    const names = forward.entries.map((e) => e.displayName);
    expect(names.slice(-2)).toEqual(['F5', 'F6']);
    expect(names.slice(0, 4)).toEqual(['F1', 'F2', 'F3', 'F4']);
  });
});
