import type { MyMembership, TeamDetail } from '../../lib/data';

export interface SectionProps {
  membership: MyMembership;
  detail: TeamDetail;
  reload: () => Promise<void>;
}
