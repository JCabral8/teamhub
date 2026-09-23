import type {
  CallupMode,
  EventRosterEntry,
  PositionConfig,
  RosterRequirement,
  RosterSource,
  TeamPosition,
} from '../../src/domain/index.ts';

export const G: TeamPosition = { id: 'pos-g', name: 'Goalie', kind: 'GOALIE', componentIds: [], sortOrder: 0 };
export const F: TeamPosition = { id: 'pos-f', name: 'Forward', kind: 'BASE', componentIds: [], sortOrder: 1 };
export const D: TeamPosition = { id: 'pos-d', name: 'Defence', kind: 'BASE', componentIds: [], sortOrder: 2 };
export const FD: TeamPosition = { id: 'pos-fd', name: 'Forward/Defence', kind: 'HYBRID', componentIds: [F.id, D.id], sortOrder: 3 };

export const config = (goalieEnabled = true, extra: TeamPosition[] = []): PositionConfig => ({
  positions: [G, F, D, FD, ...extra],
  goalieEnabled,
});

export const hockeyRequirements = (g = 1, f = 6, d = 4): RosterRequirement[] => [
  { positionId: G.id, quantity: g },
  { positionId: F.id, quantity: f },
  { positionId: D.id, quantity: d },
];

export function entry(
  name: string,
  positionId: string | null,
  overrides: Partial<EventRosterEntry> & { source?: RosterSource } = {},
): EventRosterEntry {
  return {
    userId: overrides.userId ?? `u-${name}`,
    displayName: name,
    source: 'ROSTER',
    positionId,
    response: 'NO_RESPONSE',
    responseOrigin: null,
    reason: null,
    pendingSince: null,
    ...overrides,
  };
}

export const yes = (e: EventRosterEntry): EventRosterEntry => ({ ...e, response: 'YES', responseOrigin: 'PLAYER' });
export const no = (e: EventRosterEntry): EventRosterEntry => ({ ...e, response: 'NO', responseOrigin: 'PLAYER' });

/** A full default roster: 1 goalie, 6 forwards, 4 defence, all attending. */
export function fullRoster(): EventRosterEntry[] {
  return [
    yes(entry('Gary', G.id)),
    ...['Fa', 'Fb', 'Fc', 'Fd', 'Fe', 'Ff'].map((n) => yes(entry(n, F.id))),
    ...['Da', 'Db', 'Dc', 'Dd'].map((n) => yes(entry(n, D.id))),
  ];
}

export const ctx = (mode: CallupMode = 'ADVANCED', goalieEnabled = true, requirements = hockeyRequirements()) => ({
  requirements,
  config: config(goalieEnabled),
  mode,
});
