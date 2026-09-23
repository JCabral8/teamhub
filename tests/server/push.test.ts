// Push delivery (spec §55): stored notifications go out once, callup invitations look like any other.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleApi } from '../../src/server/http.ts';
import { deliverPendingPush, expoPushSender, type PushMessage } from '../../src/server/push.ts';
import { DEFAULT_NOW, buildTeam, createGame, createHarness, type Harness } from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  h.setNow(DEFAULT_NOW);
  // Earlier tests' notifications would otherwise be delivered here too.
  await h.sql`update public.notifications set push_sent_at = now() where push_sent_at is null`;
});

function recorder(invalid: string[] = []) {
  const sent: PushMessage[] = [];
  return { sent, send: async (m: PushMessage[]) => (sent.push(...m), { invalidTokens: invalid }) };
}

async function addToken(userId: string, token: string) {
  await h.sql`insert into public.push_tokens (user_id, token, platform) values (${userId}, ${token}, 'ios')`;
}

describe('push delivery', () => {
  it('sends each new notification once to every device of its recipient', async () => {
    const t = await buildTeam(h, { callups: [['C1', 'Forward']] });
    await addToken(t.players.F1.userId, 'ExponentPushToken[f1-phone]');
    await addToken(t.players.F1.userId, 'ExponentPushToken[f1-tablet]');
    await addToken(t.players.C1.userId, 'ExponentPushToken[c1]');
    const { eventId } = await createGame(h, t);
    await h.run(t.managerId, 'sendAttendanceNow', { eventId });
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.managerId, 'runCallupSelection', { eventId });

    const r = recorder();
    await deliverPendingPush(h.sql, r.send, h.now);
    const f1 = r.sent.filter((m) => m.to.includes('f1'));
    expect(f1).toHaveLength(2);
    expect(f1[0]).toMatchObject({ body: 'Are you attending? Tap to respond.', data: { eventId, type: 'EVENT_INVITATION' } });

    // The callup's push is the same invitation a roster player gets (spec §46).
    const c1 = r.sent.filter((m) => m.to.includes('c1'));
    expect(c1).toHaveLength(1);
    expect({ title: c1[0].title, body: c1[0].body, type: c1[0].data.type }).toEqual({ title: f1[0].title, body: f1[0].body, type: f1[0].data.type });

    const again = recorder();
    expect(await deliverPendingPush(h.sql, again.send, h.now)).toBe(0);
    expect(again.sent).toEqual([]);
  });

  it('drops tokens the push service reports as unregistered', async () => {
    const t = await buildTeam(h);
    await addToken(t.players.G1.userId, 'ExponentPushToken[gone]');
    await createGame(h, t).then(({ eventId }) => h.run(t.managerId, 'sendAttendanceNow', { eventId }));
    await deliverPendingPush(h.sql, recorder(['ExponentPushToken[gone]']).send, h.now);
    expect(await h.sql`select 1 from public.push_tokens where token = 'ExponentPushToken[gone]'`).toHaveLength(0);
  });

  it('a failed push does not fail the command that created the notification', async () => {
    const t = await buildTeam(h);
    const { eventId } = await createGame(h, t);
    const res = await handleApi(
      new Request('http://x/api', { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ command: 'sendAttendanceNow', params: { eventId } }) }),
      {
        sql: h.sql,
        authenticate: async () => t.managerId,
        now: () => h.now,
        random: () => 0,
        push: async () => {
          throw new Error('push service down');
        },
      },
    );
    expect(res.status).toBe(200);
    const [e] = await h.sql<{ release_state: string }[]>`select release_state from public.events where id = ${eventId}`;
    expect(e.release_state).toBe('RELEASED');
  });

  it('the Expo sender batches 100 per request and reports DeviceNotRegistered tokens', async () => {
    const bodies: PushMessage[][] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const chunk = JSON.parse(init.body as string) as PushMessage[];
      bodies.push(chunk);
      const data = chunk.map((m) => (m.to === 'bad' ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' }));
      return new Response(JSON.stringify({ data }), { status: 200 });
    }) as typeof fetch;
    const messages = Array.from({ length: 150 }, (_, i): PushMessage => ({
      to: i === 120 ? 'bad' : `t${i}`,
      title: 'x',
      body: 'y',
      sound: 'default',
      data: { eventId: null, type: 'EVENT_INVITATION' },
    }));
    const out = await expoPushSender(fakeFetch)(messages);
    expect(bodies.map((b) => b.length)).toEqual([100, 50]);
    expect(out.invalidTokens).toEqual(['bad']);
  });
});
