import { DomainError, type ManagerRole } from './types.ts';

/**
 * Manager governance (spec §2, §56). "Manager" in permissions means either role unless a rule
 * names the Team Manager specifically.
 */

export interface Actor {
  userId: string;
  role: ManagerRole | null;
}

export interface MemberRef {
  userId: string;
  role: ManagerRole | null;
}

export const isManager = (actor: Actor) => actor.role !== null;
export const isTeamManager = (actor: Actor) => actor.role === 'MANAGER';

export function assertManager(actor: Actor): void {
  if (!isManager(actor)) throw new DomainError('FORBIDDEN', 'Only Managers can do this.');
}

export function assertTeamManager(actor: Actor): void {
  if (!isTeamManager(actor)) throw new DomainError('FORBIDDEN', 'Only the Team Manager can do this.');
}

export const canDeleteTeam = isTeamManager;

/** Whether the actor may remove the target from the Team entirely. */
export function canRemoveMember(actor: Actor, target: MemberRef): boolean {
  if (target.role === 'MANAGER') return false; // succession first
  if (target.role === 'ASSISTANT_MANAGER') return actor.userId === target.userId || isTeamManager(actor);
  return isManager(actor) || actor.userId === target.userId;
}

/** Whether the actor may take the Assistant Manager role away from the target (keeping them on the Team). */
export function canRemoveAssistantRole(actor: Actor, target: MemberRef): boolean {
  if (target.role !== 'ASSISTANT_MANAGER') return false;
  return actor.userId === target.userId || isTeamManager(actor);
}

export function canAssignAssistant(actor: Actor, target: MemberRef): boolean {
  return isManager(actor) && target.role === null;
}

/**
 * Manager succession: the Team Manager hands the role to another active member and immediately
 * becomes an Assistant Manager. Returns the new roles.
 */
export function transferManager(
  actor: Actor,
  target: MemberRef,
): { previousManager: { userId: string; role: ManagerRole }; newManager: { userId: string; role: ManagerRole } } {
  assertTeamManager(actor);
  if (target.userId === actor.userId) throw new DomainError('INVALID_SUCCESSOR', 'Choose another member as Manager.');
  return {
    previousManager: { userId: actor.userId, role: 'ASSISTANT_MANAGER' },
    newManager: { userId: target.userId, role: 'MANAGER' },
  };
}

/** The Team Manager cannot simply step down; the only way out is succession. */
export function assertCanLeaveTeam(actor: Actor): void {
  if (actor.role === 'MANAGER') {
    throw new DomainError('MANAGER_SUCCESSION_REQUIRED', 'Assign a new Manager before leaving the Team.');
  }
}
