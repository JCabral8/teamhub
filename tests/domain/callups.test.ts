import { describe, expect, it } from 'vitest';
import {
  SKATER_SLOT,
  buildCallupPools,
  calculateCallupNeeds,
  processCallupSelection,
  type CallupMember,
  type CallupSelectionInput,
  type EventRosterEntry,
} from '../../src/domain/index.ts';
import { D, F, FD, G, config, ctx, entry, fullRoster, no } from './fixtures.ts';

const member = (name: string, positionId: string | null, acceptedCount = 0): CallupMember => ({
  userId: `u-${name}`,
  displayName: name,
  positionId,
  acceptedCount,
});

const input = (roster: EventRosterEntry[], members: CallupMember[], over: Partial<CallupSelectionInput> = {}): CallupSelectionInput => ({
  ...ctx('ADVANCED'),
  roster,
  members,
  savedOrder: {},
  method: 'PREDETERMINED_SEQUENCE',
  unavailableUserIds: new Set(),
  random: () => 0,
  ...over,
});

const missing = (...names: string[]) => fullRoster().map((e) => (names.includes(e.displayName) ? no(e) : e));

describe('Callup needs', () => {
  it('there is no fixed number of callups: a full roster needs none', () => {
    expect(calculateCallupNeeds(fullRoster(), ctx())).toEqual([]);
  });

  it('players who have not answered still count as expected', () => {
    const roster = fullRoster().map((e) => (e.displayName === 'Fa' ? { ...e, response: 'NO_RESPONSE' as const } : e));
    expect(calculateCallupNeeds(roster, ctx())).toEqual([]);
  });

  it('a decline creates exactly one need in its Position', () => {
    expect(calculateCallupNeeds(missing('Da'), ctx())).toEqual([
      { slotKey: D.id, positionId: D.id, isGoalie: false, count: 1 },
    ]);
  });

  it('BASIC mode pools skater needs but keeps Goalie separate', () => {
    expect(calculateCallupNeeds(missing('Da', 'Fa', 'Gary'), ctx('BASIC'))).toEqual([
      { slotKey: G.id, positionId: G.id, isGoalie: true, count: 1 },
      { slotKey: SKATER_SLOT, positionId: null, isGoalie: false, count: 2 },
    ]);
  });

  it('no Goalie need while Goalie is disabled', () => {
    expect(calculateCallupNeeds(missing('Gary'), ctx('ADVANCED', false))).toEqual([]);
  });
});

describe('Callup pools', () => {
  it('a hybrid callup appears in every underlying pool with its own rank, never a flexible pool', () => {
    const members = [member('Hy', FD.id), member('Fred', F.id), member('Dan', D.id)];
    const pools = buildCallupPools(members, { [F.id]: ['u-Fred', 'u-Hy'], [D.id]: ['u-Hy', 'u-Dan'] }, config(), 'ADVANCED');
    expect(pools[F.id]).toEqual(['u-Fred', 'u-Hy']);
    expect(pools[D.id]).toEqual(['u-Hy', 'u-Dan']);
    expect(Object.keys(pools).sort()).toEqual([D.id, F.id].sort());
  });

  it('BASIC mode uses a single list plus Goalie', () => {
    const pools = buildCallupPools([member('Hy', FD.id), member('Gil', G.id), member('Fred', F.id)], {}, config(), 'BASIC');
    expect(pools).toEqual({ [SKATER_SLOT]: ['u-Fred', 'u-Hy'], [G.id]: ['u-Gil'] });
  });
});

describe('Callup selection', () => {
  it('predetermined sequence takes the top ranked eligible callup', () => {
    const members = [member('Dan', D.id), member('Dee', D.id)];
    const picks = processCallupSelection(input(missing('Da'), members, { savedOrder: { [D.id]: ['u-Dee', 'u-Dan'] } }));
    expect(picks).toEqual([{ userId: 'u-Dee', targetPositionId: D.id, poolKey: D.id, rank: 1 }]);
  });

  it('randomized rotation picks among those with the fewest accepted callups', () => {
    const members = [member('Dan', D.id, 3), member('Dee', D.id, 1), member('Dot', D.id, 1)];
    const first = processCallupSelection(input(missing('Da'), members, { method: 'RANDOMIZED_ROTATION', random: () => 0 }));
    const last = processCallupSelection(input(missing('Da'), members, { method: 'RANDOMIZED_ROTATION', random: () => 0.99 }));
    expect([first[0].userId, last[0].userId].sort()).toEqual(['u-Dee', 'u-Dot']);
  });

  it('#11 when the Defence pool is exhausted the other pools are searched', () => {
    const picks = processCallupSelection(input(missing('Da'), [member('Fred', F.id)]));
    expect(picks).toEqual([{ userId: 'u-Fred', targetPositionId: D.id, poolKey: F.id, rank: 1 }]);
  });

  it('#12 a hybrid callup satisfies the missing Position from the Defence pool first', () => {
    const picks = processCallupSelection(
      input(missing('Da'), [member('Fred', F.id), member('Hy', FD.id)], { savedOrder: { [F.id]: ['u-Fred', 'u-Hy'] } }),
    );
    expect(picks[0]).toMatchObject({ userId: 'u-Hy', poolKey: D.id });
  });

  it('Goalie never falls back to skaters', () => {
    expect(processCallupSelection(input(missing('Gary'), [member('Fred', F.id)]))).toEqual([]);
  });

  it('skips callups already on the Event (including those who declined) and unavailable ones', () => {
    const roster = [...missing('Da', 'Db'), no(entry('Dan', D.id, { source: 'CALLUP' }))];
    const members = [member('Dan', D.id), member('Dee', D.id), member('Dot', D.id)];
    const picks = processCallupSelection(input(roster, members, { unavailableUserIds: new Set(['u-Dee']) }));
    expect(picks.map((p) => p.userId)).toEqual(['u-Dot']);
  });

  it('open invitations count toward the need so nobody is double-invited', () => {
    const roster = [...missing('Da'), entry('Dan', D.id, { source: 'CALLUP' })];
    const picks = processCallupSelection(
      input(roster, [member('Dee', D.id)], { callupTargets: new Map([['u-Dan', D.id]]) }),
    );
    expect(picks).toEqual([]);
  });
});
