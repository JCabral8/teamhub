// Push delivery (spec §55): sends stored notifications to the Expo push service. Every notification a
// player gets, a callup invitation included, goes out with the same shape (spec §46).
import type { Sql } from './db.ts';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: { eventId: string | null; type: string };
}

/** Sends messages and reports tokens the push service says are no longer registered. */
export type PushSender = (messages: PushMessage[]) => Promise<{ invalidTokens: string[] }>;

const BATCH = 500;

/**
 * Claims unsent notifications from the last day, marks them sent, then delivers them. Claiming first
 * means a notification is pushed at most once even when the API and the scheduler run together; a
 * failed delivery is logged by the caller and the notification stays in the in-app list.
 */
export async function deliverPendingPush(sql: Sql, send: PushSender, now: Date): Promise<number> {
  const messages = await sql.begin(async (tx) => {
    const rows = await tx<{ id: string; user_id: string; event_id: string | null; type: string; title: string; body: string }[]>`
      select id, user_id, event_id, type, title, body from public.notifications
      where push_sent_at is null and created_at > now() - interval '1 day'
      order by created_at
      limit ${BATCH}
      for update skip locked
    `;
    if (!rows.length) return [];
    await tx`update public.notifications set push_sent_at = ${now} where id in ${tx(rows.map((r) => r.id))}`;
    const tokens = await tx<{ user_id: string; token: string }[]>`
      select user_id, token from public.push_tokens where user_id in ${tx([...new Set(rows.map((r) => r.user_id))])}
    `;
    return rows.flatMap((r) =>
      tokens
        .filter((t) => t.user_id === r.user_id)
        .map((t): PushMessage => ({ to: t.token, title: r.title, body: r.body, sound: 'default', data: { eventId: r.event_id, type: r.type } })),
    );
  });
  if (!messages.length) return 0;
  const { invalidTokens } = await send(messages);
  if (invalidTokens.length) await sql`delete from public.push_tokens where token in ${sql(invalidTokens)}`;
  return messages.length;
}

/** Expo push API sender (https://exp.host/--/api/v2/push/send), 100 messages per request. */
export function expoPushSender(fetchImpl: typeof fetch = fetch, accessToken?: string): PushSender {
  return async (messages) => {
    const invalidTokens: string[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const res = await fetchImpl('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) throw new Error(`Expo push request failed with ${res.status}`);
      const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      out.data?.forEach((ticket, j) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') invalidTokens.push(chunk[j].to);
      });
    }
    return { invalidTokens };
  };
}
