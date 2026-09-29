// Everything an Event screen needs: the Event and its roster, the Team, and for Managers the Team's
// Positions and members. Stays live while anyone answers (spec §58).
import { calculateCallupNeeds, calculateRosterStatus } from '../../domain/index.ts';
import { loadEventDetail, loadMyCallups, loadTeamDetail, type EventDetail, type MyMembership, type TeamDetail } from '../../lib/data';
import { useLoader, useRealtime } from '../../lib/hooks';
import { isManagerOf, useTeams } from '../../lib/teams';

export function useEventData(id: string) {
  const teams = useTeams();
  const membershipFor = (teamId: string) => teams.active.find((m) => m.team.id === teamId);

  const state = useLoader(async () => {
    const detail = await loadEventDetail(id, (teamId) => isManagerOf(membershipFor(teamId)));
    const membership = membershipFor(detail.event.team_id);
    const [team, callups] = await Promise.all([
      membership && isManagerOf(membership) ? loadTeamDetail(membership.team, true) : Promise.resolve(null),
      loadMyCallups(),
    ]);
    return { detail, team, myCallup: callups.get(id) };
  }, [id, teams.active.length]);

  useRealtime(
    `event-${id}`,
    [
      { table: 'events', filter: `id=eq.${id}` },
      { table: 'event_roster_players', filter: `event_id=eq.${id}` },
      { table: 'callup_invitations', filter: `event_id=eq.${id}` },
    ],
    () => void state.reload(),
  );

  const membership: MyMembership | undefined = state.data ? membershipFor(state.data.detail.event.team_id) : undefined;
  return {
    ...state,
    teamsLoading: teams.loading,
    multiTeam: teams.active.length > 1,
    membership,
    manager: isManagerOf(membership),
  };
}

/** Roster numbers for Managers: open spots, counts and Position coverage. */
function rosterContext(detail: EventDetail, team: TeamDetail, membership: MyMembership) {
  return {
    requirements: detail.requirements,
    config: team.config,
    mode: membership.team.callup_mode,
    callupTargets: new Map(detail.invites.filter((i) => !i.closed_at && i.response !== 'NO').map((i) => [i.user_id, i.target_position_id])),
    callupSpots: detail.event.callup_spots,
  };
}

export function rosterStatus(detail: EventDetail, team: TeamDetail, membership: MyMembership) {
  return calculateRosterStatus(detail.roster, rosterContext(detail, team, membership));
}

/**
 * Spots callups could fill now: open spots nobody is still expected to take. Players who haven't
 * answered or said Maybe (and callups already asked) still count, so callups only replace a definite
 * No (decision 4).
 */
export function spotsForCallups(detail: EventDetail, team: TeamDetail, membership: MyMembership): number {
  return calculateCallupNeeds(detail.roster, rosterContext(detail, team, membership)).reduce((s, n) => s + n.count, 0);
}

/** Whether this Event's roster needs differ from the Team default (wireframe 2E "Custom Roster for This Event"). */
export function hasCustomRequirements(detail: EventDetail, team: TeamDetail, membership: MyMembership): boolean {
  const defaultSpots = membership.team.include_callups ? membership.team.callup_spots : 0;
  if (detail.event.callup_spots !== defaultSpots) return true;
  const norm = (list: { positionId: string; quantity: number }[]) =>
    list
      .filter((r) => r.quantity > 0)
      .map((r) => `${r.positionId}:${r.quantity}`)
      .sort()
      .join(',');
  return norm(detail.requirements) !== norm(team.requirements);
}
