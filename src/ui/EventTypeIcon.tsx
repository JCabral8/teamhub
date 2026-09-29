// The Event type icons used throughout the app (wireframe 5, "Event Type Icons"), and the status
// pills that show where a person stands on an Event.
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import type { EventType, RosterStanding } from '../domain/index.ts';
import { Badge } from './components';
import { STANDING_DISPLAY } from './format';

type McIcon = ComponentProps<typeof MaterialCommunityIcons>['name'];

export const EVENT_TYPE_STYLE: Record<EventType, { label: string; icon: McIcon; color: string; bg: string }> = {
  GAME: { label: 'Game', icon: 'trophy', color: '#1668F2', bg: '#E4EDFE' },
  PRACTICE: { label: 'Practice', icon: 'traffic-cone', color: '#1E9E53', bg: '#E1F4E8' },
  TOURNAMENT: { label: 'Tournament', icon: 'calendar-star', color: '#E0383B', bg: '#FDE6E6' },
  MEETING: { label: 'Meeting', icon: 'account-group', color: '#7C4DDB', bg: '#EFE8FC' },
  SOCIAL: { label: 'Social', icon: 'party-popper', color: '#E8742A', bg: '#FDEEE3' },
  CUSTOM: { label: 'Custom Event', icon: 'plus', color: '#5B6478', bg: '#ECEFF4' },
};

export function EventTypeIcon({ type, size = 36 }: { type: EventType; size?: number }) {
  const s = EVENT_TYPE_STYLE[type];
  return (
    <View
      accessibilityLabel={s.label}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: s.bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <MaterialCommunityIcons name={s.icon} size={size * 0.56} color={s.color} />
    </View>
  );
}

/** A person's standing on an Event as a pill. Before attendance goes out it reads "Not Requested". */
export function StandingPill({ standing, released = true, short }: { standing: RosterStanding; released?: boolean; short?: boolean }) {
  if (!released) return <Badge label="Not Requested" tone="neutral" />;
  const d = STANDING_DISPLAY[standing];
  return <Badge label={short && standing === 'PENDING_APPROVAL' ? 'Pending' : d.label} tone={d.tone} icon={d.icon} />;
}
