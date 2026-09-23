import {
  goaliePosition,
  isActiveGoalie,
  isGoalieActive,
  sortPositions,
  underlyingPositionIds,
} from './positions.ts';
import type {
  CallupMode,
  EventRosterEntry,
  PositionConfig,
  RosterRequirement,
  RosterStanding,
} from './types.ts';

/**
 * Roster capacity model.
 *
 * Requirements (e.g. 1 Goalie, 6 Forward, 4 Defence) become slots. In ADVANCED callup mode every
 * required Position is its own slot. In BASIC mode Positions are ignored except Goalie, so all skater
 * requirements pool into one slot (spec §39). A player fits a slot through their Position; a hybrid
 * fits every underlying base Position (spec §10). Players whose Position has no requirement fit any
 * skater slot. With no requirements configured at all the roster is unlimited.
 */

export const SKATER_SLOT = 'SKATERS';

export interface Slot {
  key: string;
  /** Position the slot stands for; null for the pooled BASIC skater slot. */
  positionId: string | null;
  capacity: number;
  isGoalie: boolean;
}

export interface SlotModel {
  slots: Slot[];
  unlimited: boolean;
}

export function buildSlotModel(
  requirements: RosterRequirement[],
  config: PositionConfig,
  mode: CallupMode,
): SlotModel {
  const goalie = goaliePosition(config);
  const goalieActive = isGoalieActive(config);
  const byId = new Map(config.positions.map((p) => [p.id, p]));
  const slots: Slot[] = [];

  const goalieReq = goalie && goalieActive ? requirements.find((r) => r.positionId === goalie.id) : undefined;
  if (goalie && goalieReq && goalieReq.quantity > 0) {
    slots.push({ key: goalie.id, positionId: goalie.id, capacity: goalieReq.quantity, isGoalie: true });
  }

  const baseReqs = requirements
    .filter((r) => r.quantity > 0 && byId.get(r.positionId)?.kind === 'BASE')
    .sort((a, b) => byId.get(a.positionId)!.sortOrder - byId.get(b.positionId)!.sortOrder);

  if (mode === 'BASIC') {
    const capacity = baseReqs.reduce((sum, r) => sum + r.quantity, 0);
    if (capacity > 0) slots.push({ key: SKATER_SLOT, positionId: null, capacity, isGoalie: false });
  } else {
    for (const r of baseReqs) {
      slots.push({ key: r.positionId, positionId: r.positionId, capacity: r.quantity, isGoalie: false });
    }
  }

  return { slots, unlimited: slots.length === 0 };
}

/** Slots a player with this Position may occupy. */
export function eligibleSlots(
  positionId: string | null,
  model: SlotModel,
  config: PositionConfig,
  mode: CallupMode,
): string[] {
  const skaterSlots = model.slots.filter((s) => !s.isGoalie).map((s) => s.key);
  if (isActiveGoalie(positionId, config)) {
    const goalieSlot = model.slots.find((s) => s.isGoalie);
    return goalieSlot ? [goalieSlot.key] : skaterSlots;
  }
  if (mode === 'BASIC') return skaterSlots;
  const ids = underlyingPositionIds(positionId, config);
  const matched = model.slots.filter((s) => !s.isGoalie && s.positionId && ids.includes(s.positionId));
  return matched.length ? matched.map((s) => s.key) : skaterSlots;
}

export interface SlotCandidate {
  id: string;
  eligible: string[];
}

export interface SlotAssignment {
  assignment: Map<string, string>;
  unassigned: string[];
}

/**
 * Maximum assignment of players to slots respecting capacities (bipartite matching with augmenting
 * paths). Hybrids end up wherever they unblock the most coverage, which is also the internal
 * planning Position managers see (spec §43).
 */
export function assignToSlots(candidates: SlotCandidate[], slots: Slot[]): SlotAssignment {
  const capacity = new Map(slots.map((s) => [s.key, s.capacity]));
  const holders = new Map<string, string[]>(slots.map((s) => [s.key, []]));
  const eligible = new Map(candidates.map((c) => [c.id, c.eligible.filter((k) => capacity.has(k))]));
  const assignment = new Map<string, string>();

  const tryAssign = (id: string, visited: Set<string>): boolean => {
    for (const slot of eligible.get(id) ?? []) {
      if (visited.has(slot)) continue;
      visited.add(slot);
      const held = holders.get(slot)!;
      if (held.length < capacity.get(slot)!) {
        held.push(id);
        assignment.set(id, slot);
        return true;
      }
      for (let i = 0; i < held.length; i++) {
        if (tryAssign(held[i], visited)) {
          held[i] = id;
          assignment.set(id, slot);
          return true;
        }
      }
    }
    return false;
  };

  // Place the least flexible players first so the result is stable and hybrids fill the gaps.
  const order = candidates
    .map((c, index) => ({ c, index }))
    .sort((a, b) => eligible.get(a.c.id)!.length - eligible.get(b.c.id)!.length || a.index - b.index);
  const unassigned: string[] = [];
  for (const { c } of order) {
    if (!tryAssign(c.id, new Set())) unassigned.push(c.id);
  }
  return { assignment, unassigned };
}

export function standingOf(entry: Pick<EventRosterEntry, 'response' | 'pendingSince'>): RosterStanding {
  if (entry.response === 'YES') return entry.pendingSince ? 'PENDING_APPROVAL' : 'ATTENDING';
  if (entry.response === 'NO') return 'NOT_ATTENDING';
  return 'NO_RESPONSE';
}

export const isAttending = (entry: Pick<EventRosterEntry, 'response' | 'pendingSince'>) =>
  standingOf(entry) === 'ATTENDING';

/** Eligible slots for an Event roster entry. A callup invited for a specific need also fits that need. */
export function entrySlots(
  entry: EventRosterEntry,
  model: SlotModel,
  config: PositionConfig,
  mode: CallupMode,
  callupTargets?: ReadonlyMap<string, string | null>,
): string[] {
  const natural = eligibleSlots(entry.positionId, model, config, mode);
  if (entry.source !== 'CALLUP' || !callupTargets?.has(entry.userId)) return natural;
  const target = callupTargets.get(entry.userId) ?? null;
  const targetSlot = target ? model.slots.find((s) => s.key === target || s.positionId === target)?.key : undefined;
  return targetSlot && !natural.includes(targetSlot) ? [targetSlot, ...natural] : natural;
}

export interface RosterContext {
  requirements: RosterRequirement[];
  config: PositionConfig;
  mode: CallupMode;
  /** Internal callup targets (userId → Position id or null for any skater). Manager-only data. */
  callupTargets?: ReadonlyMap<string, string | null>;
}

/** Whether a player can join the attending roster without displacing anyone (spec §37). */
export function hasRosterSpaceFor(roster: EventRosterEntry[], candidate: EventRosterEntry, ctx: RosterContext): boolean {
  const model = buildSlotModel(ctx.requirements, ctx.config, ctx.mode);
  if (model.unlimited) return true;
  const toCandidate = (e: EventRosterEntry) => ({
    id: e.userId,
    eligible: entrySlots(e, model, ctx.config, ctx.mode, ctx.callupTargets),
  });
  const attending = roster.filter((e) => isAttending(e) && e.userId !== candidate.userId).map(toCandidate);
  const before = assignToSlots(attending, model.slots).assignment.size;
  const after = assignToSlots([...attending, toCandidate(candidate)], model.slots).assignment.size;
  return after > before;
}

export interface PositionCoverage {
  positionId: string;
  name: string;
  isGoalie: boolean;
  required: number;
  /** Attending players currently covering this Position. */
  attending: number;
  /** Red warning: fewer attending than required (spec §34). */
  short: boolean;
}

/**
 * Position coverage warnings for managers. Always Position-aware, whatever the callup mode, and driven
 * by the configured requirements rather than hardcoded numbers. Goalie warnings vanish when Goalie is off.
 */
export function calculatePositionCoverage(
  roster: EventRosterEntry[],
  requirements: RosterRequirement[],
  config: PositionConfig,
): PositionCoverage[] {
  const model = buildSlotModel(requirements, config, 'ADVANCED');
  const attending = roster
    .filter(isAttending)
    .map((e) => ({ id: e.userId, eligible: eligibleSlots(e.positionId, model, config, 'ADVANCED') }));
  const { assignment } = assignToSlots(attending, model.slots);
  const byId = new Map(config.positions.map((p) => [p.id, p]));
  return model.slots.map((slot) => {
    const filled = [...assignment.values()].filter((k) => k === slot.key).length;
    return {
      positionId: slot.positionId!,
      name: byId.get(slot.positionId!)?.name ?? '',
      isGoalie: slot.isGoalie,
      required: slot.capacity,
      attending: filled,
      short: filled < slot.capacity,
    };
  });
}

/** Internal planning Position per attending player (spec §43). Never shown to players. */
export function planPositions(
  roster: EventRosterEntry[],
  requirements: RosterRequirement[],
  config: PositionConfig,
): Map<string, string> {
  const model = buildSlotModel(requirements, config, 'ADVANCED');
  const attending = roster
    .filter(isAttending)
    .map((e) => ({ id: e.userId, eligible: eligibleSlots(e.positionId, model, config, 'ADVANCED') }));
  return assignToSlots(attending, model.slots).assignment;
}

export interface AttendanceCounts {
  /** Attending Goalies, reported separately whenever Goalie is enabled (spec §33). */
  goalies: number;
  /** Attending non-Goalie players. */
  players: number;
  pendingApproval: number;
  notAttending: number;
  noResponse: number;
}

export function calculateAttendanceCounts(roster: EventRosterEntry[], config: PositionConfig): AttendanceCounts {
  const counts: AttendanceCounts = { goalies: 0, players: 0, pendingApproval: 0, notAttending: 0, noResponse: 0 };
  for (const e of roster) {
    switch (standingOf(e)) {
      case 'ATTENDING':
        if (isActiveGoalie(e.positionId, config)) counts.goalies++;
        else counts.players++;
        break;
      case 'PENDING_APPROVAL':
        counts.pendingApproval++;
        break;
      case 'NOT_ATTENDING':
        counts.notAttending++;
        break;
      case 'NO_RESPONSE':
        counts.noResponse++;
        break;
    }
  }
  return counts;
}

/** "1 Goalie · 9 Players". Goalies are never folded into the player total. */
export function formatAttendanceSummary(counts: AttendanceCounts, config: PositionConfig): string {
  const parts: string[] = [];
  const goalie = goaliePosition(config);
  if (goalie && config.goalieEnabled) {
    parts.push(`${counts.goalies} ${counts.goalies === 1 ? goalie.name : pluralize(goalie.name)}`);
  }
  parts.push(`${counts.players} ${counts.players === 1 ? 'Player' : 'Players'}`);
  return parts.join(' · ');
}

function pluralize(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/i.test(word)) return word + 'es';
  return word + 's';
}

export interface RosterGroup {
  positionId: string | null;
  name: string;
  /** Number of ATTENDING players in this group (spec §35). Never invited or rostered totals. */
  count: number;
  entries: EventRosterEntry[];
}

const STANDING_ORDER: Record<RosterStanding, number> = {
  ATTENDING: 0,
  PENDING_APPROVAL: 1,
  NO_RESPONSE: 2,
  NOT_ATTENDING: 3,
};

const byName = (a: EventRosterEntry, b: EventRosterEntry) =>
  a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });

/**
 * Manager roster view grouped by official Position (spec §36). Not-attending players stay in their
 * Position group and sort to the bottom; there is no separate "not attending" group.
 */
export function groupRosterByPosition(roster: EventRosterEntry[], config: PositionConfig): RosterGroup[] {
  const groups: RosterGroup[] = [];
  const known = new Set<string>();
  for (const p of sortPositions(config.positions)) {
    if (p.kind === 'GOALIE' && !config.goalieEnabled) continue;
    known.add(p.id);
    groups.push({ positionId: p.id, name: p.name, count: 0, entries: [] });
  }
  const unassigned: RosterGroup = { positionId: null, name: 'Unassigned', count: 0, entries: [] };
  for (const e of roster) {
    const group = e.positionId && known.has(e.positionId) ? groups.find((g) => g.positionId === e.positionId)! : unassigned;
    group.entries.push(e);
  }
  if (unassigned.entries.length) groups.push(unassigned);
  for (const g of groups) {
    g.entries.sort((a, b) => STANDING_ORDER[standingOf(a)] - STANDING_ORDER[standingOf(b)] || byName(a, b));
    g.count = g.entries.filter(isAttending).length;
  }
  return groups.filter((g) => g.entries.length > 0);
}

/** What a player may see about an Event roster: alphabetical, no Positions, no callup marking or ranking. */
export interface PlayerRosterEntry {
  userId: string;
  displayName: string;
  standing: RosterStanding;
  reason: string | null;
}

export function toPlayerRosterView(roster: EventRosterEntry[]): PlayerRosterEntry[] {
  return [...roster].sort(byName).map((e) => ({
    userId: e.userId,
    displayName: e.displayName,
    standing: standingOf(e),
    reason: e.response === 'NO' ? e.reason : null,
  }));
}

export interface RosterStatus {
  counts: AttendanceCounts;
  coverage: PositionCoverage[];
  /** Pending players mean the roster has a discrepancy managers should look at. */
  hasDiscrepancy: boolean;
  openSpots: number | null;
}

export function calculateRosterStatus(roster: EventRosterEntry[], ctx: RosterContext): RosterStatus {
  const counts = calculateAttendanceCounts(roster, ctx.config);
  const model = buildSlotModel(ctx.requirements, ctx.config, ctx.mode);
  let openSpots: number | null = null;
  if (!model.unlimited) {
    const attending = roster
      .filter(isAttending)
      .map((e) => ({ id: e.userId, eligible: entrySlots(e, model, ctx.config, ctx.mode, ctx.callupTargets) }));
    const filled = assignToSlots(attending, model.slots).assignment.size;
    openSpots = model.slots.reduce((s, x) => s + x.capacity, 0) - filled;
  }
  return {
    counts,
    coverage: calculatePositionCoverage(roster, ctx.requirements, ctx.config),
    hasDiscrepancy: counts.pendingApproval > 0,
    openSpots,
  };
}
