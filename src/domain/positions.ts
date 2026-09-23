import { DomainError, type PositionConfig, type TeamPosition } from './types.ts';

/** The Positions every new Team starts with (spec §7). No other example Positions are added. */
export const DEFAULT_BASE_POSITIONS = ['Forward', 'Defence'] as const;
export const DEFAULT_GOALIE_NAME = 'Goalie';
export const HYBRID_SEPARATOR = '/';
export const POSITION_NAME_MAX_LENGTH = 40;

export function normalizePositionName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Validates a new base Position or a Goalie rename. Returns the normalized name. */
export function validatePositionName(name: string, existing: TeamPosition[], ignoreId?: string): string {
  const normalized = normalizePositionName(name);
  if (!normalized) throw new DomainError('POSITION_NAME_REQUIRED', 'Position name is required.');
  if (normalized.length > POSITION_NAME_MAX_LENGTH) {
    throw new DomainError('POSITION_NAME_TOO_LONG', `Position name must be ${POSITION_NAME_MAX_LENGTH} characters or fewer.`);
  }
  if (normalized.includes(HYBRID_SEPARATOR)) {
    throw new DomainError('POSITION_NAME_INVALID', 'Use a Hybrid Position to combine Positions.');
  }
  const clash = existing.find((p) => p.id !== ignoreId && p.name.toLowerCase() === normalized.toLowerCase());
  if (clash) throw new DomainError('POSITION_NAME_TAKEN', `A Position named "${clash.name}" already exists.`);
  return normalized;
}

/**
 * Validates a Hybrid Position composed of existing base Positions (spec §9, §10).
 * Returns the ordered component ids and the generated name, e.g. "Forward/Defence".
 * Supports any number of components (two or more).
 */
export function validateHybridPosition(
  componentIds: string[],
  existing: TeamPosition[],
): { componentIds: string[]; name: string } {
  const unique = [...new Set(componentIds)];
  if (unique.length < 2) {
    throw new DomainError('HYBRID_NEEDS_TWO_POSITIONS', 'A Hybrid Position combines at least two base Positions.');
  }
  const components = unique.map((id) => {
    const p = existing.find((x) => x.id === id);
    if (!p || p.kind !== 'BASE') {
      throw new DomainError('HYBRID_COMPONENT_INVALID', 'A Hybrid Position can only combine existing base Positions.');
    }
    return p;
  });
  components.sort((a, b) => a.sortOrder - b.sortOrder);
  const ordered = components.map((c) => c.id);
  const key = [...ordered].sort().join(',');
  const duplicate = existing.find((p) => p.kind === 'HYBRID' && [...p.componentIds].sort().join(',') === key);
  if (duplicate) throw new DomainError('HYBRID_EXISTS', `"${duplicate.name}" already exists.`);
  return { componentIds: ordered, name: components.map((c) => c.name).join(HYBRID_SEPARATOR) };
}

/** Hybrid names follow their components, so a renamed base Position renames its hybrids. */
export function hybridName(hybrid: TeamPosition, positions: TeamPosition[]): string {
  return hybrid.componentIds
    .map((id) => positions.find((p) => p.id === id))
    .filter((p): p is TeamPosition => !!p)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => p.name)
    .join(HYBRID_SEPARATOR);
}

export function goaliePosition(config: PositionConfig): TeamPosition | undefined {
  return config.positions.find((p) => p.kind === 'GOALIE');
}

/** True when the special Goalie Position exists and is enabled (spec §8). */
export function isGoalieActive(config: PositionConfig): boolean {
  return config.goalieEnabled && !!goaliePosition(config);
}

/** True when this Position id is the Goalie and Goalie functionality is enabled. */
export function isActiveGoalie(positionId: string | null, config: PositionConfig): boolean {
  if (!positionId) return false;
  const g = goaliePosition(config);
  return !!g && g.id === positionId && config.goalieEnabled;
}

/**
 * The base Positions a player's Position counts toward (spec §10: a hybrid belongs to every
 * underlying Position). Goalie is returned only while enabled. Unknown or missing → [].
 */
export function underlyingPositionIds(positionId: string | null, config: PositionConfig): string[] {
  if (!positionId) return [];
  const p = config.positions.find((x) => x.id === positionId);
  if (!p) return [];
  if (p.kind === 'GOALIE') return config.goalieEnabled ? [p.id] : [];
  if (p.kind === 'BASE') return [p.id];
  return p.componentIds.filter((id) => config.positions.some((x) => x.id === id && x.kind === 'BASE'));
}

/** Hybrid eligibility: which base Positions this player may satisfy. */
export function calculateHybridEligibility(positionId: string | null, config: PositionConfig): string[] {
  return underlyingPositionIds(positionId, config);
}

export function sortPositions(positions: TeamPosition[]): TeamPosition[] {
  const kindOrder = { GOALIE: 0, BASE: 1, HYBRID: 2 } as const;
  return [...positions].sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.sortOrder - b.sortOrder);
}
