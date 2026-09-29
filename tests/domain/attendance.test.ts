import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_RESPONSES,
  addWithoutAttendanceRequest,
  decidePending,
  processAttendanceChange,
  setCallupStatus,
  wouldBePending,
  releaseAttendance,
  resetForNewRelease,
  type EventAttendanceState,
  type EventRosterEntry,
} from '../../src/domain/index.ts';
import { D, F, ctx, entry, fullRoster, no, yes } from './fixtures.ts';

const NOW = new Date('2026-10-01T12:00:00Z');
const state = (roster: EventRosterEntry[], mode: 'BASIC' | 'ADVANCED' = 'ADVANCED'): EventAttendanceState => ({
  ...ctx(mode),
  released: true,
  roster,
});
const find = (entries: EventRosterEntry[], name: string) => entries.find((e) => e.displayName === name)!;

describe('Responses', () => {
  it('answers are YES, NO and MAYBE, plus NO_RESPONSE before anyone answers (wireframes 6, 7)', () => {
    expect([...ATTENDANCE_RESPONSES]).toEqual(['YES', 'NO', 'MAYBE', 'NO_RESPONSE']);
  });

  it('MAYBE holds no roster spot and carries no reason', () => {
    const r = processAttendanceChange(state(fullRoster()), 'u-Fa', 'MAYBE', 'ignored', NOW);
    expect(find(r.updates, 'Fa')).toMatchObject({ response: 'MAYBE', reason: null, pendingSince: null });
    expect(r.spotOpened).toBe(true);
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

  it('#7 nobody is promoted automatically: a Manager approves pending players (wireframe 4)', () => {
    const roster = [...fullRoster(), yes(entry('Pat', F.id, { pendingSince: '2026-10-01T10:00:00Z' }))];
    const r = processAttendanceChange(state(roster), 'u-Fb', 'NO', null, NOW);
    expect(r.updates.find((e) => e.displayName === 'Pat')).toBeUndefined();
    expect(r.spotOpened).toBe(true);
    expect(decidePending(state(roster), 'u-Pat', true)).toMatchObject({ response: 'YES', pendingSince: null });
  });

  it('#8 declining a pending player records No as the Manager\'s decision', () => {
    const roster = [...fullRoster(), yes(entry('Pat', F.id, { pendingSince: '2026-10-01T10:00:00Z' }))];
    expect(decidePending(state(roster), 'u-Pat', false)).toMatchObject({ response: 'NO', pendingSince: null, responseOrigin: 'MANAGER' });
    expect(() => decidePending(state(roster), 'u-Fa', true)).toThrow(/not waiting/);
  });

  it('tells a player before they confirm that the roster is full (wireframe 4A)', () => {
    const roster = fullRoster().map((e) => (e.displayName === 'Fa' ? no(e) : e));
    expect(wouldBePending(state(roster), 'u-Fa')).toBe(false);
    roster.push(yes(entry('Callup Carl', F.id, { source: 'CALLUP' })));
    expect(wouldBePending(state(roster), 'u-Fa')).toBe(true);
  });
});

describe('Callup responses', () => {
  it('#9 a callup accepts and fills the vacancy', () => {
    const roster = fullRoster().map((e) => (e.displayName === 'Fa' ? no(e) : e));
    roster.push(entry('Cal', F.id, { source: 'CALLUP' }));
    const r = processAttendanceChange(state(roster), 'u-Cal', 'YES', null, NOW);
    expect(find(r.updates, 'Cal')).toMatchObject({ response: 'YES', pendingSince: null });
    expect(r.notices).toEqual([
      { kind: 'CALLUP_ACCEPTED', userId: 'u-Cal' },
      { kind: 'CALLUP_CONFIRMED', userId: 'u-Cal' },
    ]);
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

  it('a default player gets their Position slot back from a callup who can use a callup spot', () => {
    const roster = [
      ...fullRoster().map((e) => (e.displayName === 'Fa' ? no(e) : e)),
      yes(entry('Cal', F.id, { source: 'CALLUP' })),
    ];
    const r = processAttendanceChange({ ...state(roster), callupSpots: 1 }, 'u-Fa', 'YES', null, NOW);
    expect(find(r.updates, 'Fa')).toMatchObject({ response: 'YES', pendingSince: null });
  });

  it('a callup spot takes a callup when every Position is full (wireframe 2)', () => {
    const roster = [...fullRoster(), entry('Cal', F.id, { source: 'CALLUP' })];
    const r = processAttendanceChange({ ...state(roster), callupSpots: 1 }, 'u-Cal', 'YES', null, NOW);
    expect(find(r.updates, 'Cal').response).toBe('YES');
  });

  it('Managers set a callup\'s status by hand (wireframe 3E)', () => {
    const roster = [...fullRoster(), entry('Cal', F.id, { source: 'CALLUP' })];
    expect(setCallupStatus(state(roster), 'u-Cal', 'YES')).toMatchObject({ response: 'YES', responseOrigin: 'MANAGER' });
    expect(setCallupStatus(state(roster), 'u-Cal', 'NO_RESPONSE')).toMatchObject({ response: 'NO_RESPONSE', responseOrigin: null });
    expect(() => setCallupStatus(state(roster), 'u-Fa', 'YES')).toThrow(/not a callup/);
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
