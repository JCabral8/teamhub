import { describe, expect, it } from 'vitest';
import {
  calculateAttendanceCounts,
  calculatePositionCoverage,
  calculateRosterStatus,
  formatAttendanceSummary,
  groupRosterByPosition,
  hasRosterSpaceFor,
  planPositions,
  toPlayerRosterView,
} from '../../src/domain/index.ts';
import { D, F, FD, G, config, ctx, entry, fullRoster, hockeyRequirements, no, yes } from './fixtures.ts';

describe('Position counts and grouping', () => {
  it('#33 counts only attending players beside a Position', () => {
    const roster = [
      ...['A', 'B', 'C', 'D', 'E', 'F'].map((n) => yes(entry(`Fwd ${n}`, F.id))),
      no(entry('Fwd G', F.id)),
      no(entry('Fwd H', F.id)),
    ];
    const forward = groupRosterByPosition(roster, config()).find((g) => g.positionId === F.id)!;
    expect(forward.count).toBe(6);
    expect(forward.entries).toHaveLength(8);
  });

  it('#34 keeps not-attending players inside their Position group, with no separate category', () => {
    const roster = [yes(entry('Amy', F.id)), no(entry('Ben', F.id)), yes(entry('Cal', D.id))];
    const groups = groupRosterByPosition(roster, config());
    expect(groups.map((g) => g.name)).toEqual(['Forward', 'Defence']);
    expect(groups.find((g) => g.name === 'Forward')!.entries.map((e) => e.displayName)).toEqual(['Amy', 'Ben']);
    expect(groups.some((g) => /not attending/i.test(g.name))).toBe(false);
  });

  it('#35 sorts not-attending players to the bottom of their group', () => {
    const roster = [
      no(entry('Aaron', F.id)),
      entry('Beth', F.id),
      yes(entry('Zed', F.id)),
      yes(entry('Mia', F.id)),
      yes(entry('Paul', F.id, { pendingSince: '2026-01-01T00:00:00Z' })),
    ];
    const names = groupRosterByPosition(roster, config())[0].entries.map((e) => e.displayName);
    expect(names).toEqual(['Mia', 'Zed', 'Paul', 'Beth', 'Aaron']);
  });

  it('hides the Goalie group while Goalie is disabled', () => {
    const roster = [yes(entry('Gary', G.id)), yes(entry('Amy', F.id))];
    const groups = groupRosterByPosition(roster, config(false));
    expect(groups.map((g) => g.name)).toEqual(['Forward', 'Unassigned']);
  });
});

describe('Attendance summary', () => {
  it('always separates the Goalie from the player count', () => {
    const roster = [yes(entry('Gary', G.id)), ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((n) => yes(entry(n, F.id)))];
    const counts = calculateAttendanceCounts(roster, config());
    expect(counts).toMatchObject({ goalies: 1, players: 9 });
    expect(formatAttendanceSummary(counts, config())).toBe('1 Goalie · 9 Players');
  });

  it('uses the renamed Goalie label', () => {
    const cfg = { ...config(), positions: config().positions.map((p) => (p.id === G.id ? { ...p, name: 'Keeper' } : p)) };
    const counts = calculateAttendanceCounts([yes(entry('K', G.id)), yes(entry('P', F.id))], cfg);
    expect(formatAttendanceSummary(counts, cfg)).toBe('1 Keeper · 1 Player');
  });

  it('#14 folds goalies into players and drops the Goalie label when Goalie is disabled', () => {
    const counts = calculateAttendanceCounts([yes(entry('Gary', G.id)), yes(entry('Amy', F.id))], config(false));
    expect(counts).toMatchObject({ goalies: 0, players: 2 });
    expect(formatAttendanceSummary(counts, config(false))).toBe('2 Players');
  });
});

describe('Position coverage', () => {
  it('#13 flags a missing Goalie in red', () => {
    const roster = fullRoster().filter((e) => e.positionId !== G.id);
    const goalie = calculatePositionCoverage(roster, hockeyRequirements(), config()).find((c) => c.isGoalie)!;
    expect(goalie).toMatchObject({ required: 1, attending: 0, short: true });
  });

  it('#14 drops Goalie warnings entirely when Goalie is disabled', () => {
    const roster = fullRoster().filter((e) => e.positionId !== G.id);
    const coverage = calculatePositionCoverage(roster, hockeyRequirements(), config(false));
    expect(coverage.some((c) => c.isGoalie)).toBe(false);
    expect(coverage.every((c) => !c.short)).toBe(true);
  });

  it('flags Defence below 4 and Forward below 6 using configured numbers', () => {
    const roster = fullRoster().map((e) => (e.displayName === 'Da' || e.displayName === 'Fa' ? no(e) : e));
    const cov = calculatePositionCoverage(roster, hockeyRequirements(), config());
    expect(cov.find((c) => c.positionId === D.id)).toMatchObject({ attending: 3, short: true });
    expect(cov.find((c) => c.positionId === F.id)).toMatchObject({ attending: 5, short: true });
    // Same roster, lower configured requirements: no warnings.
    const relaxed = calculatePositionCoverage(roster, hockeyRequirements(1, 5, 3), config());
    expect(relaxed.every((c) => !c.short)).toBe(true);
  });

  it('#12 plans an attending hybrid into the deficient Position', () => {
    const roster = fullRoster().map((e) => (e.displayName === 'Da' ? no(e) : e));
    roster.push(yes(entry('Hy', FD.id)));
    const plan = planPositions(roster, hockeyRequirements(), config());
    expect(plan.get('u-Hy')).toBe(D.id);
    expect(calculatePositionCoverage(roster, hockeyRequirements(), config()).every((c) => !c.short)).toBe(true);
  });
});

describe('Roster capacity', () => {
  it('lets a hybrid take a spot in either underlying Position', () => {
    const roster = fullRoster().map((e) => (e.displayName === 'Da' ? no(e) : e));
    expect(hasRosterSpaceFor(roster, entry('Hy', FD.id), ctx('ADVANCED'))).toBe(true);
    expect(hasRosterSpaceFor(roster, entry('Fz', F.id), ctx('ADVANCED'))).toBe(false);
  });

  it('pools skaters in BASIC mode but keeps Goalie separate', () => {
    const roster = fullRoster().map((e) => (e.displayName === 'Da' ? no(e) : e));
    expect(hasRosterSpaceFor(roster, entry('Fz', F.id), ctx('BASIC'))).toBe(true);
    expect(hasRosterSpaceFor(roster, entry('G2', G.id), ctx('BASIC'))).toBe(false);
  });

  it('is unlimited when no default roster quantities are configured', () => {
    expect(hasRosterSpaceFor(fullRoster(), entry('X', F.id), ctx('ADVANCED', true, []))).toBe(true);
  });

  it('reports open spots and discrepancies', () => {
    const roster = fullRoster().map((e) => (e.displayName === 'Da' ? no(e) : e));
    roster.push(yes(entry('Late', F.id, { pendingSince: '2026-01-01T00:00:00Z' })));
    const status = calculateRosterStatus(roster, ctx('ADVANCED'));
    expect(status.openSpots).toBe(1);
    expect(status.hasDiscrepancy).toBe(true);
  });
});

describe('Player-facing roster view', () => {
  it('#37 #38 #40 is alphabetical and carries no Position, ranking or callup marking', () => {
    const roster = [
      yes(entry('Zoe', F.id)),
      yes(entry('Adam', D.id, { source: 'CALLUP' })),
      no(entry('Moe', F.id, { source: 'CALLUP', reason: 'Work' })),
    ];
    const view = toPlayerRosterView(roster);
    expect(view.map((v) => v.displayName)).toEqual(['Adam', 'Moe', 'Zoe']);
    for (const v of view) {
      expect(Object.keys(v).sort()).toEqual(['displayName', 'reason', 'standing', 'userId']);
    }
    // An accepted callup is indistinguishable from an accepted roster player.
    const { userId: _a, displayName: _b, ...adam } = view[0];
    const { userId: _c, displayName: _d, ...zoe } = view[2];
    expect(adam).toEqual(zoe);
  });
});
