// NotificationService: stores in-app notifications; a push sender delivers rows with push_sent_at null.
import type { NotificationContent } from '../domain/notifications.ts';
import type { Tx } from './db.ts';

export interface OutgoingNotification {
  userId: string;
  teamId: string | null;
  eventId?: string | null;
  content: NotificationContent;
}

export async function notify(tx: Tx, items: OutgoingNotification[]): Promise<void> {
  if (!items.length) return;
  const rows = items.map((n) => ({
    user_id: n.userId,
    team_id: n.teamId,
    event_id: n.eventId ?? null,
    type: n.content.type,
    title: n.content.title,
    body: n.content.body,
  }));
  await tx`insert into public.notifications ${tx(rows, 'user_id', 'team_id', 'event_id', 'type', 'title', 'body')}`;
}

export function toMany(userIds: string[], teamId: string, eventId: string | null, content: NotificationContent): OutgoingNotification[] {
  return [...new Set(userIds)].map((userId) => ({ userId, teamId, eventId, content }));
}
