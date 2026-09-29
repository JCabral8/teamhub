// The Team picked on the Team tab, with its members, for the screens opened from that tab.
import { loadTeamDetail } from '../../lib/data';
import { useLoader, useRealtime } from '../../lib/hooks';
import { isManagerOf, useTeams } from '../../lib/teams';

export function useSelectedTeam() {
  const teams = useTeams();
  const membership = teams.selected;
  const team = membership?.team ?? null;
  const manager = isManagerOf(membership);
  const detail = useLoader(async () => (team ? loadTeamDetail(team, manager) : null), [team?.id, manager]);
  useRealtime(`team-members-${team?.id}`, team ? [{ table: 'team_memberships', filter: `team_id=eq.${team.id}` }] : [], () => void detail.reload());
  return { teams, membership, team, manager, ...detail };
}
