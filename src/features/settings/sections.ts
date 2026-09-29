import type { IconName } from '../../ui/components';

export type SectionKey = 'general' | 'branding' | 'attendance' | 'roster' | 'positions' | 'callups' | 'notifications' | 'members';

export const SETTINGS_SECTIONS: { key: SectionKey; title: string; subtitle: string; icon: IconName }[] = [
  { key: 'general', title: 'General Settings', subtitle: 'Team name, arena, default location', icon: 'information-circle-outline' },
  { key: 'branding', title: 'Logo & Colours', subtitle: 'Team logo and Team colour', icon: 'color-palette-outline' },
  { key: 'attendance', title: 'Attendance Settings', subtitle: 'Automatic or manual, release timing', icon: 'paper-plane-outline' },
  { key: 'roster', title: 'Default Roster Settings', subtitle: 'Players, Position requirements, callup spots', icon: 'people-outline' },
  { key: 'positions', title: 'Position Settings', subtitle: 'Base, hybrid and Goalie', icon: 'grid-outline' },
  { key: 'callups', title: 'Callup Settings', subtitle: 'Basic or Advanced, selection method, order', icon: 'swap-vertical-outline' },
  { key: 'notifications', title: 'Notification Settings', subtitle: 'New Event notices and Manager reminders', icon: 'notifications-outline' },
  { key: 'members', title: 'Managers & Governance', subtitle: 'Join requests, invite link, Positions, Managers', icon: 'person-add-outline' },
];
