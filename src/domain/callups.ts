import { isActiveGoalie, underlyingPositionIds } from './positions.ts';
import { SKATER_SLOT, assignToSlots, buildSlotModel, entrySlots, isAttending, type RosterContext } from './roster.ts';
import type { CallupMode, CallupSelectionMethod, EventRosterEntry, PositionConfig } from './types.ts';

/**
 * Callups (spec §38–§50).
 *
 * Pools are keyed by SKATER_SLOT (the single BASIC list), the Goalie Position id, or a base Position id
 * (ADVANCED). A hybrid callup sits in every underlying base pool with an independent rank; there is
 * never a combined "flexible" pool. Rankings are manager-only and never leave the server for players.
 */

export interface CallupMember {
  userId: string;
  displayName: string;
  positionId: string | null;
  /** Accepted callups so far on this Team; drives randomized rotation fairness. */
  acceptedCount: number;
}

/** Saved manager ordering: pool key → ordered user ids. */
export type SavedPoolOrder = Record<string, string[]>;

/** Pool keys a callup belongs to in a given mode. */
export function poolKeysFor(positionId: string | null, config: PositionConfig, mode: CallupMode): string[] {
  if (isActiveGoalie(positionId, config)) return [positionId!];
  if (mode === 'BASIC') return [SKATER_SLOT];
  const bases = underlyingPositionIds(positionId, config);
  return bases.length ? bases : [SKATER_SLOT];
}

/**
 * Builds the pools from current callup members and the saved ranking. Members missing from the saved
 * order are appended alphabetically; stale ids are dropped.
 */
export function buildCallupPools(
  members: CallupMember[],
  saved: SavedPoolOrder,
  config: PositionConfig,
  mode: CallupMode,
): Record<string, string[]> {
  const pools: Record<string, string[]> = {};
  const alphabetical = [...members].sort((a, b) => a.displayName.localeCompare(b.displayName));
  for (const m of alphabetical) {
    for (const key of poolKeysFor(m.positionId, config, mode)) (pools[key] ??= []).push(m.userId);
  }
  for (const key of Object.keys(pools)) {
    const order = saved[key] ?? [];
    const rank = new Map(order.map((id, i) => [id, i]));
    pools[key].sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity));
  }
  return pools;
}

export interface CallupNeed {
  slotKey: string;
  /** Position the need is for; null for the pooled BASIC skater slot. */
  positionId: string | null;
  isGoalie: boolean;
  count: number;
}

/**
 * Open roster vacancies that callups should fill. Players still expected (confirmed YES, default-roster
 * players yet to answer, open callup invitations) count as filling a slot; pending players do not.
 * There is no fixed callup count per Event: needs exist only when requirements create them (spec §50).
 */
export function calculateCallupNeeds(roster: EventRosterEntry[], ctx: RosterContext): CallupNeed[] {
  const model = buildSlotModel(ctx.requirements, ctx.config, ctx.mode);
  if (model.unlimited) return [];
  const expected = roster
    .filter((e) => isAttending(e) || e.response === 'NO_RESPONSE')
    .map((e) => ({ id: e.userId, eligible: entrySlots(e, model, ctx.config, ctx.mode, ctx.callupTargets) }));
  const { assignment } = assignToSlots(expected, model.slots);
  const needs: CallupNeed[] = [];
  for (const slot of model.slots) {
    const filled = [...assignment.values()].filter((k) => k === slot.key).length;
    if (filled < slot.capacity) {
      needs.push({ slotKey: slot.key, positionId: slot.positionId, isGoalie: slot.isGoalie, count: slot.capacity - filled });
    }
  }
  return needs.sort((a, b) => Number(b.isGoalie) - Number(a.isGoalie));
}

/** Callups who may be invited to this Event: not already on its roster and not unavailable that day. */
export function calculateCallupEligibility(
  members: CallupMember[],
  roster: EventRosterEntry[],
  unavailableUserIds: ReadonlySet<string>,
): CallupMember[] {
  const onRoster = new Set(roster.map((e) => e.userId));
  return members.filter((m) => !onRoster.has(m.userId) && !unavailableUserIds.has(m.userId));
}

export interface CallupSelection {
  userId: string;
  /** Internal target Position (null = any skater in BASIC mode). Never shown to the player. */
  targetPositionId: string | null;
  poolKey: string;
  /** 1-based rank within the pool at selection time. Manager-only. */
  rank: number;
}

export interface CallupSelectionInput extends RosterContext {
  roster: EventRosterEntry[];
  members: CallupMember[];
  savedOrder: SavedPoolOrder;
  method: CallupSelectionMethod;
  unavailableUserIds: ReadonlySet<string>;
  /** Injected for deterministic tests; defaults to Math.random. */
  random?: () => number;
}

/** Order in which pools are searched for a need, including exhaustion fallback (spec §42). */
function poolSearchOrder(need: CallupNeed, config: PositionConfig, mode: CallupMode): string[] {
  if (need.isGoalie) return [need.slotKey];
  if (mode === 'BASIC') return [SKATER_SLOT];
  const bases = config.positions
    .filter((p) => p.kind === 'BASE')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => p.id);
  const others = bases.filter((id) => id !== need.positionId);
  return [need.positionId!, ...others, SKATER_SLOT];
}

/**
 * Chooses callups for current vacancies (spec §39–§42). PREDETERMINED SEQUENCE takes the highest ranked
 * eligible callup; RANDOMIZED ROTATION picks randomly among those with the fewest accepted callups.
 * When a Position's pool runs out, the other skater pools are searched; Goalie never falls back.
 */
export function processCallupSelection(input: CallupSelectionInput): CallupSelection[] {
  const random = input.random ?? Math.random;
  const needs = calculateCallupNeeds(input.roster, input);
  if (!needs.length) return [];

  const eligible = new Map(
    calculateCallupEligibility(input.members, input.roster, input.unavailableUserIds).map((m) => [m.userId, m]),
  );
  const pools = buildCallupPools([...eligible.values()], input.savedOrder, input.config, input.mode);
  const fullPools = buildCallupPools(input.members, input.savedOrder, input.config, input.mode);
  const chosen = new Set<string>();
  const selections: CallupSelection[] = [];

  for (const need of needs) {
    for (let i = 0; i < need.count; i++) {
      for (const poolKey of poolSearchOrder(need, input.config, input.mode)) {
        const candidates = (pools[poolKey] ?? []).filter((id) => !chosen.has(id));
        if (!candidates.length) continue;
        let pick: string;
        if (input.method === 'PREDETERMINED_SEQUENCE') {
          pick = candidates[0];
        } else {
          const least = Math.min(...candidates.map((id) => eligible.get(id)!.acceptedCount));
          const tier = candidates.filter((id) => eligible.get(id)!.acceptedCount === least);
          pick = tier[Math.min(tier.length - 1, Math.floor(random() * tier.length))];
        }
        chosen.add(pick);
        selections.push({
          userId: pick,
          targetPositionId: need.positionId,
          poolKey,
          rank: (fullPools[poolKey] ?? []).indexOf(pick) + 1,
        });
        break;
      }
    }
  }
  return selections;
}
