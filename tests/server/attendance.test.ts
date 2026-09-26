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
  it('#4 Yes → No opens a spot that a callup is invited for', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    expect(await openInvites(h, eventId)).toEqual([]);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    expect((await openInvites(h, eventId)).map((i) => i.user_id)).toEqual([t.players.CF1.userId]);
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
    await h.run(t.players.CF1.userId, 'respondAttendance', { eventId, response: 'YES' });
    const res = await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'YES' });
    expect(res.standing).toBe('PENDING_APPROVAL');
    expect((await rosterRow(h, eventId, t.players.F1.userId)).pending_since).not.toBeNull();
    expect(await notificationsFor(h, t.players.F1.userId, 'PENDING_APPROVAL')).toHaveLength(1);
    expect(await notificationsFor(h, t.managerId, 'ATTENDANCE_DISCREPANCY')).toHaveLength(1);
  });

  it('#7 a pending player takes the next open spot, before any callup is invited', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward'], ['CF2', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.players.CF1.userId, 'respondAttendance', { eventId, response: 'YES' });
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'YES' });

    await h.run(t.players.F2.userId, 'respondAttendance', { eventId, response: 'NO' });
    expect((await rosterRow(h, eventId, t.players.F1.userId)).pending_since).toBeNull();
    expect(await notificationsFor(h, t.players.F1.userId, 'ROSTER_SPOT_CONFIRMED')).toHaveLength(1);
    expect(await openInvites(h, eventId)).toEqual([expect.objectContaining({ user_id: t.players.CF1.userId, response: 'YES' })]);
  });

  it('#8 multiple pending players: first come, first served', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward'], ['CF2', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    for (const [player, callup] of [['F1', 'CF1'], ['F2', 'CF2']]) {
      await h.run(t.players[player].userId, 'respondAttendance', { eventId, response: 'NO' });
      await h.run(t.players[callup].userId, 'respondAttendance', { eventId, response: 'YES' });
    }
    h.setNow('2026-10-01T12:05:00Z');
    await h.run(t.players.F2.userId, 'respondAttendance', { eventId, response: 'YES' });
    h.setNow('2026-10-01T12:10:00Z');
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'YES' });
    h.setNow('2026-10-01T12:15:00Z');
    await h.run(t.players.F3.userId, 'respondAttendance', { eventId, response: 'NO' });

    expect((await rosterRow(h, eventId, t.players.F2.userId)).pending_since).toBeNull();
    expect((await rosterRow(h, eventId, t.players.F1.userId)).pending_since).not.toBeNull();
  });
});

describe('Callups (#9–#14)', () => {
  it('#9 a callup accepts and fills the vacancy', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    const res = await h.run(t.players.CF1.userId, 'respondAttendance', { eventId, response: 'YES' });
    expect(res.standing).toBe('ATTENDING');
    expect(await notificationsFor(h, t.managerId, 'CALLUP_ACCEPTED')).toHaveLength(1);
  });

  it('#10 a callup declines: the next callup is invited and the decliner is not asked again', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward'], ['CF2', 'Forward']], settings: { callupSelectionMethod: 'PREDETERMINED_SEQUENCE' } });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    expect((await openInvites(h, eventId)).map((i) => i.user_id)).toEqual([t.players.CF1.userId]);
    await h.run(t.players.CF1.userId, 'respondAttendance', { eventId, response: 'NO' });
    const invites = await openInvites(h, eventId);
    expect(invites.map((i) => [i.user_id, i.response])).toEqual([
      [t.players.CF1.userId, 'NO'],
      [t.players.CF2.userId, 'NO_RESPONSE'],
    ]);
    expect(await notificationsFor(h, t.managerId, 'CALLUP_DECLINED')).toHaveLength(1);
    // Once the replacement accepts, the decliner cannot come back through Pending Approval.
    await h.run(t.players.CF2.userId, 'respondAttendance', { eventId, response: 'YES' });
    expect(await h.fail(t.players.CF1.userId, 'respondAttendance', { eventId, response: 'YES' })).toBe('CALLUP_SPOT_FILLED');
    expect((await rosterRow(h, eventId, t.players.CF1.userId)).pending_since).toBeNull();
  });

  it('there is no default of three callups: a full roster invites nobody', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward'], ['CF2', 'Forward'], ['CF3', 'Forward'], ['CF4', 'Defence']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    expect(await openInvites(h, eventId)).toEqual([]);
  });

  it('#11 when the Defence pool is exhausted the Forward pool is searched', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']], settings: { callupMode: 'ADVANCED' } });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.D1.userId, 'respondAttendance', { eventId, response: 'NO' });
    expect(await openInvites(h, eventId)).toEqual([
      expect.objectContaining({ user_id: t.players.CF1.userId, target_position_id: t.pos.Defence, pool_key: t.pos.Forward }),
    ]);
    const res = await h.run(t.players.CF1.userId, 'respondAttendance', { eventId, response: 'YES' });
    expect(res.standing).toBe('ATTENDING');
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
    expect(await openInvites(h, eventId)).toEqual([expect.objectContaining({ user_id: t.players.HY1.userId, pool_key: t.pos.Defence })]);
  });

  it('#13 a missing Goalie invites a Goalie callup, never a skater', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.G1.userId, 'respondAttendance', { eventId, response: 'NO' });
    expect(await openInvites(h, eventId)).toEqual([]);

    const t2 = await buildTeam(h, { callups: [['CF1', 'Forward'], ['CG1', 'Goalie']] });
    const e2 = await releasedGame(h, t2);
    await everyoneYes(h, t2, e2);
    await h.run(t2.players.G1.userId, 'respondAttendance', { eventId: e2, response: 'NO' });
    expect((await openInvites(h, e2)).map((i) => i.user_id)).toEqual([t2.players.CG1.userId]);
  });

  it('#14 with Goalie disabled a missing Goalie creates no need and goalies count as players', async () => {
    const t = await buildTeam(h, { callups: [['CG1', 'Goalie']] });
    await h.run(t.managerId, 'configureGoalie', { teamId: t.teamId, enabled: false });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.G1.userId, 'respondAttendance', { eventId, response: 'NO' });
    expect(await openInvites(h, eventId)).toEqual([]);
    // Re-enabling brings Goalie logic back.
    await h.run(t.managerId, 'configureGoalie', { teamId: t.teamId, enabled: true, name: 'Keeper' });
    await h.run(t.managerId, 'runCallupSelection', { eventId });
    expect((await openInvites(h, eventId)).map((i) => i.user_id)).toEqual([t.players.CG1.userId]);
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
