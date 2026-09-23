import type { IconName } from '../../ui/components';

export type SectionKey = 'general' | 'attendance' | 'roster' | 'positions' | 'callups' | 'members';

export const SETTINGS_SECTIONS: { key: SectionKey; title: string; subtitle: string; icon: IconName }[] = [
  { key: 'general', title: 'General', subtitle: 'Team name, arena, default location', icon: 'information-circle-outline' },
  { key: 'attendance', title: 'Attendance', subtitle: 'Automatic or manual, release timing, reminders', icon: 'paper-plane-outline' },
  { key: 'roster', title: 'Default Roster', subtitle: 'How many players each Position needs', icon: 'people-outline' },
  { key: 'positions', title: 'Positions', subtitle: 'Base, hybrid and Goalie', icon: 'grid-outline' },
  { key: 'callups', title: 'Callups', subtitle: 'Basic or Advanced, selection method, order', icon: 'swap-vertical-outline' },
  { key: 'members', title: 'Members & Managers', subtitle: 'Join requests, Positions, Managers', icon: 'person-add-outline' },
];
