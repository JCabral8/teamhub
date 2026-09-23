import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_RESPONSES,
  addWithoutAttendanceRequest,
  processAttendanceChange,
  releaseAttendance,
  resetForNewRelease,
  type EventAttendanceState,
  type EventRosterEntry,
} from '../../src/domain/index.ts';
import { D, F, FD, ctx, entry, fullRoster, no, yes } from './fixtures.ts';

const NOW = new Date('2026-10-01T12:00:00Z');
const state = (roster: EventRosterEntry[], mode: 'BASIC' | 'ADVANCED' = 'ADVANCED'): EventAttendanceState => ({
  ...ctx(mode),
  released: true,
  roster,
});
const find = (entries: EventRosterEntry[], name: string) => entries.find((e) => e.displayName === name)!;

describe('Responses', () => {
  it('#36 only YES, NO and NO_RESPONSE exist', () => {
    expect([...ATTENDANCE_RESPONSES]).toEqual(['YES', 'NO', 'NO_RESPONSE']);
  });

  it('#1 a player selects Yes and joins the attending roster', () => {
    const roster = fullRoster().filter((e) => e.displayName !== 'Fa');
    roster.push(entry('Fa', F.id));
    const r = processAttendanceChange(state(roster), 'u-Fa', 'YES', null, NOW);
    expect(find(r.updates, 'Fa')).toMatchObject({ response: 'YES', pendingSince: null });
    expect(r.notices).toEqual([]);
  });

  it('#2 a player selects No with a short reason', () => {
    const r = processAttendanceChange(state(fullRoster()), 'u-Fa', 'NO', '  Out of town ', NOW);
    expect(find(r.updates, 'Fa')).toMatchObject({ response: 'NO', reason: 'Out of town' });
  });

  it('rejects reasons over 75 characters', () => {
    expect(() => processAttendanceChange(state(fullRoster()), 'u-Fa', 'NO', 'x'.repeat(76), NOW)).toThrow(
      /75 characters/,
    );
    expect(() => processAttendanceChange(state(fullRoster()), 'u-Fa', 'NO', 'x'.repeat(75), NOW)).not.toThrow();
  });

  it('#3 a player who never answers stays NO_RESPONSE', () => {
    const roster = [entry('Quiet', F.id)];
    const r = releaseAttendance(roster, new Set());
    expect(r.updates).toEqual([]);
    expect(r.invitees).toEqual(['u-Quiet']);
    expect(roster[0].response).toBe('NO_RESPONSE');
  });

  it('refuses answers before attendance is released', () => {
    expect(() =>
      processAttendanceChange({ ...state(fullRoster()), released: false }, 'u-Fa', 'NO', null, NOW),
    ).toThrow(/not been sent/);
  });
});

describe('Attendance changes', () => {
  it('#4 Yes → No is allowed and opens a spot', () => {
    const r = processAttendanceChange(state(fullRoster()), 'u-Fa', 'NO', null, NOW);
    expect(find(r.updates, 'Fa').response).toBe('NO');
    expect(r.spotOpened).toBe(true);
  });

  it('#5 No → Yes with space restores the player immediately', () => {
    const roster = fullRoster().map((e) => (e.displayName === 'Fa' ? no(e) : e));
    const r = processAttendanceChange(state(roster), 'u-Fa', 'YES', null, NOW);
    expect(find(r.updates, 'Fa')).toMatchObject({ response: 'YES', pendingSince: null });
  });

  it('#6 No → Yes without space goes to Pending Approval and flags a discrepancy', () => {
    const roster = fullRoster().map((e) => (e.displayName === 'Fa' ? no(e) : e));
    roster.push(yes(entry('Callup Carl', F.id, { source: 'CALLUP' })));
    const r = processAttendanceChange(state(roster), 'u-Fa', 'YES', null, NOW);
    expect(find(r.updates, 'Fa')).toMatchObject({ response: 'YES', pendingSince: NOW.toISOString() });
    expect(r.notices).toEqual([
      { kind: 'PENDING_APPROVAL', userId: 'u-Fa' },
      { kind: 'ROSTER_DISCREPANCY', userId: 'u-Fa' },
    ]);
  });

  it('#7 a pending player takes the spot as soon as someone leaves', () => {
    const roster = [...fullRoster(), yes(entry('Pat', F.id, { pendingSince: '2026-10-01T10:00:00Z' }))];
    const r = processAttendanceChange(state(roster), 'u-Fb', 'NO', null, NOW);
    expect(find(r.updates, 'Pat').pendingSince).toBeNull();
    expect(r.notices).toContainEqual({ kind: 'ROSTER_SPOT_CONFIRMED', userId: 'u-Pat' });
    expect(r.spotOpened).toBe(false);
  });

  it('#8 multiple pending players: the earliest gets the one spot', () => {
    const roster = [
      ...fullRoster(),
      yes(entry('Late', F.id, { pendingSince: '2026-10-01T11:00:00Z' })),
      yes(entry('Early', F.id, { pendingSince: '2026-10-01T09:00:00Z' })),
    ];
    const r = processAttendanceChange(state(roster), 'u-Fb', 'NO', null, NOW);
    expect(find(r.updates, 'Early').pendingSince).toBeNull();
    expect(r.updates.find((e) => e.displayName === 'Late')).toBeUndefined();
  });

  it('skips an earlier pending player who does not fit the open Position', () => {
    const roster = [
      ...fullRoster(),
      yes(entry('EarlyD', D.id, { pendingSince: '2026-10-01T09:00:00Z' })),
      yes(entry('LateF', F.id, { pendingSince: '2026-10-01T11:00:00Z' })),
    ];
    const r = processAttendanceChange(state(roster), 'u-Fb', 'NO', null, NOW);
    expect(find(r.updates, 'LateF').pendingSince).toBeNull();
    expect(r.updates.find((e) => e.displayName === 'EarlyD')).toBeUndefined();
  });

  it('a pending hybrid can take a spot in either Position', () => {
    const roster = [...fullRoster(), yes(entry('Hy', FD.id, { pendingSince: '2026-10-01T09:00:00Z' }))];
    const r = processAttendanceChange(state(roster), 'u-Da', 'NO', null, NOW);
    expect(find(r.updates, 'Hy').pendingSince).toBeNull();
  });
});

describe('Callup responses', () => {
  it('#9 a callup accepts and fills the vacancy', () => {
    const roster = fullRoster().map((e) => (e.displayName === 'Fa' ? no(e) : e));
    roster.push(entry('Cal', F.id, { source: 'CALLUP' }));
    const r = processAttendanceChange(state(roster), 'u-Cal', 'YES', null, NOW);
    expect(find(r.updates, 'Cal')).toMatchObject({ response: 'YES', pendingSince: null });
    expect(r.notices).toEqual([{ kind: 'CALLUP_ACCEPTED', userId: 'u-Cal' }]);
  });

  it('#10 a callup declines', () => {
    const roster = [...fullRoster(), entry('Cal', F.id, { source: 'CALLUP' })];
    const r = processAttendanceChange(state(roster), 'u-Cal', 'NO', null, NOW);
    expect(find(r.updates, 'Cal').response).toBe('NO');
    expect(r.notices).toEqual([{ kind: 'CALLUP_DECLINED', userId: 'u-Cal' }]);
  });

  it('callups never go to Pending Approval', () => {
    const roster = [...fullRoster(), entry('Cal', F.id, { source: 'CALLUP' })];
    expect(() => processAttendanceChange(state(roster), 'u-Cal', 'YES', null, NOW)).toThrow(/already been filled/);
  });

  it('a callup invited for Defence fits the Defence need even as a pure Forward', () => {
    const roster = fullRoster().map((e) => (e.displayName === 'Da' ? no(e) : e));
    roster.push(entry('Fwd Cal', F.id, { source: 'CALLUP' }));
    const s = { ...state(roster), callupTargets: new Map([['u-Fwd Cal', D.id]]) };
    const r = processAttendanceChange(s, 'u-Fwd Cal', 'YES', null, NOW);
    expect(find(r.updates, 'Fwd Cal').response).toBe('YES');
  });
});

describe('Release and re-release', () => {
  it('#29 marks unavailable players NO automatically and flags it as system-generated', () => {
    const roster = [entry('Away', F.id), entry('Here', F.id)];
    const r = releaseAttendance(roster, new Set(['u-Away']));
    expect(r.updates).toEqual([expect.objectContaining({ userId: 'u-Away', response: 'NO', responseOrigin: 'SYSTEM_AVAILABILITY' })]);
    expect(r.invitees).toEqual(['u-Here']);
  });

  it('resets everyone for a new release and drops callups who never accepted', () => {
    const roster = [
      yes(entry('Reg', F.id)),
      no(entry('Declined', F.id, { source: 'CALLUP' })),
      yes(entry('Accepted', F.id, { source: 'CALLUP' })),
    ];
    const { keep, dropped } = resetForNewRelease(roster);
    expect(dropped).toEqual(['u-Declined']);
    expect(keep.every((e) => e.response === 'NO_RESPONSE')).toBe(true);
  });

  it('#19 adding without a request respects roster quantities', () => {
    const full = state(fullRoster());
    expect(() => addWithoutAttendanceRequest(full, entry('Extra', F.id, { source: 'MANAGER_ADDED' }))).toThrow(/roster is full/);
    const open = state(fullRoster().map((e) => (e.displayName === 'Fa' ? no(e) : e)));
    expect(addWithoutAttendanceRequest(open, entry('Extra', F.id, { source: 'MANAGER_ADDED' }))).toMatchObject({
      response: 'YES',
      responseOrigin: 'MANAGER',
    });
  });
});
