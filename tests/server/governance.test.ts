// Spec §61 scenarios 15–18, 30–32 and 36–40: Positions, membership, permissions, visibility and invariants.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleApi } from '../../src/server/http.ts';
import {
  DEFAULT_NOW,
  addMember,
  buildTeam,
  createGame,
  createHarness,
  everyoneYes,
  notificationsFor,
  releasedGame,
  rosterRow,
  type Harness,
} from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(() => h.setNow(DEFAULT_NOW));

describe('Positions (#15–#17)', () => {
  it('a new Team gets Forward, Defence, Forward/Defence and Goalie, and a 1/6/4 default roster', async () => {
    const t = await buildTeam(h, { roster: [] });
    expect(Object.keys(t.pos).sort()).toEqual(['Defence', 'Forward', 'Forward/Defence', 'Goalie']);
    const reqs = await h.sql<{ name: string; quantity: number }[]>`
      select p.name, r.quantity from public.default_roster_requirements r join public.team_positions p on p.id = r.team_position_id
      where r.team_id = ${t.teamId} order by p.sort_order`;
    expect(reqs).toEqual([
      { name: 'Goalie', quantity: 1 },
      { name: 'Forward', quantity: 6 },
      { name: 'Defence', quantity: 4 },
    ]);
  });

  it('#15 #16 custom and hybrid Positions', async () => {
    const t = await buildTeam(h, { roster: [] });
    const { positionId: striker } = await h.run(t.managerId, 'createPosition', { teamId: t.teamId, name: 'Striker' });
    expect(await h.fail(t.managerId, 'createPosition', { teamId: t.teamId, name: 'striker' })).toBe('POSITION_NAME_TAKEN');
    const hybrid = await h.run(t.managerId, 'createHybridPosition', { teamId: t.teamId, componentIds: [striker, t.pos.Defence] });
    expect(hybrid.name).toBe('Defence/Striker');
  });

  it('#17 invalid hybrids are rejected by the service and by the database', async () => {
    const t = await buildTeam(h, { roster: [] });
    expect(await h.fail(t.managerId, 'createHybridPosition', { teamId: t.teamId, componentIds: [t.pos.Goalie, t.pos.Forward] })).toBe(
      'HYBRID_COMPONENT_INVALID',
    );
    expect(await h.fail(t.managerId, 'createHybridPosition', { teamId: t.teamId, componentIds: [t.pos.Forward, t.pos.Defence] })).toBe(
      'HYBRID_EXISTS',
    );
    await expect(
      h.sql`insert into public.hybrid_position_components (hybrid_id, component_id) values (${t.pos['Forward/Defence']}, ${t.pos.Goalie})`,
    ).rejects.toThrow(/only combine base Positions/);
  });

  it('only one special Goalie Position can exist', async () => {
    const t = await buildTeam(h, { roster: [] });
    await expect(h.sql`insert into public.team_positions (team_id, name, kind) values (${t.teamId}, 'Keeper', 'GOALIE')`).rejects.toThrow(
      /team_positions_one_goalie/,
    );
  });

  it('changing the Team Default Roster never changes existing Events', async () => {
    const t = await buildTeam(h);
    const { eventId } = await createGame(h, t);
    await h.run(t.managerId, 'setDefaultRoster', {
      teamId: t.teamId,
      requirements: [
        { positionId: t.pos.Goalie, quantity: 2 },
        { positionId: t.pos.Forward, quantity: 8 },
      ],
    });
    const snapshot = await h.sql<{ quantity: number }[]>`select quantity from public.event_roster_requirements where event_id = ${eventId} order by quantity`;
    expect(snapshot.map((r) => r.quantity)).toEqual([1, 4, 6]);
    const { eventId: later } = await createGame(h, t, { date: '2026-10-17' });
    const next = await h.sql<{ quantity: number }[]>`select quantity from public.event_roster_requirements where event_id = ${later} order by quantity`;
    expect(next.map((r) => r.quantity)).toEqual([2, 8]);
  });
});

describe('Membership (#18, #30–#32)', () => {
  it('joining always needs Manager approval, and the Manager sets the Position', async () => {
    const t = await buildTeam(h, { roster: [] });
    const player = await h.user('Pat Player');
    await h.sql`update public.profiles set preferred_position = 'Forward' where id = ${player}`;
    await h.run(player, 'requestToJoin', { joinCode: t.joinCode });
    const [m] = await h.sql`select id, status, requested_position from public.team_memberships where user_id = ${player}`;
    expect(m).toMatchObject({ status: 'PENDING', requested_position: 'Forward' });
    expect(await notificationsFor(h, t.managerId, 'MEMBERSHIP_REQUEST')).toHaveLength(1);
    const { eventId } = await createGame(h, t);
    expect(await h.fail(player, 'respondAttendance', { eventId, response: 'YES' })).toBe('FORBIDDEN');
    await h.run(t.managerId, 'approveMember', { membershipId: m.id, positionId: t.pos.Defence, rosterRole: 'ROSTER' });
    const [pos] = await h.sql`select team_position_id from public.member_positions where membership_id = ${m.id}`;
    expect(pos.team_position_id).toBe(t.pos.Defence);
    expect(await h.fail(player, 'requestToJoin', { joinCode: 'not-a-code' })).toBe('INVALID_JOIN_LINK');
  });

  it('#18 removing a player keeps history but drops them from upcoming Events and current statistics', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']] });
    h.setNow('2026-09-20T12:00:00Z');
    const past = await releasedGame(h, t, { date: '2026-09-25' });
    await everyoneYes(h, t, past);
    h.setNow(DEFAULT_NOW);
    const upcoming = await releasedGame(h, t);
    await everyoneYes(h, t, upcoming);

    await h.run(t.managerId, 'removeMember', { membershipId: t.players.F1.membershipId });
    expect((await rosterRow(h, past, t.players.F1.userId)).removed_at).toBeNull();
    expect((await rosterRow(h, upcoming, t.players.F1.userId)).removed_at).not.toBeNull();
    const invited = await h.sql`select user_id from public.callup_invitations where event_id = ${upcoming}`;
    expect(invited.map((r) => r.user_id)).toEqual([t.players.CF1.userId]);
    const stats = await h.run(t.managerId, 'getAttendanceStatistics', { teamId: t.teamId });
    expect(stats.some((s: { userId: string }) => s.userId === t.players.F1.userId)).toBe(false);
    expect(stats.find((s: { userId: string }) => s.userId === t.players.F2.userId).regular).toEqual({ invitations: 2, yes: 2, no: 0, noResponse: 0 });
  });

  it('#30 a player on several Teams: settings and permissions stay per Team', async () => {
    const a = await buildTeam(h, { settings: { attendanceMode: 'MANUAL' } });
    const b = await buildTeam(h);
    const both = await addMember(h, b, 'Two Teams', 'Forward', 'ROSTER');
    await h.run(both.userId, 'requestToJoin', { joinCode: a.joinCode });
    const [m] = await h.sql`select id from public.team_memberships where team_id = ${a.teamId} and user_id = ${both.userId}`;
    await h.run(a.managerId, 'approveMember', { membershipId: m.id, positionId: a.pos.Forward, rosterRole: 'ROSTER' });
    const { eventId: ea } = await createGame(h, a);
    const { eventId: eb } = await createGame(h, b);
    const rows = await h.sql`select id, release_action from public.events where id in ${h.sql([ea, eb])}`;
    expect(Object.fromEntries(rows.map((r) => [r.id, r.release_action]))).toEqual({ [ea]: 'NOTIFY_MANAGER', [eb]: 'RELEASE' });
    expect(await h.fail(a.managerId, 'sendAttendanceNow', { eventId: eb })).toBe('FORBIDDEN');
    await h.run(b.managerId, 'sendAttendanceNow', { eventId: eb });
    await h.run(both.userId, 'respondAttendance', { eventId: eb, response: 'YES' });
    expect((await rosterRow(h, ea, both.userId)).response).toBe('NO_RESPONSE');
  });

  it('#31 Manager transfer: the old Manager becomes an Assistant, and there is always exactly one Manager', async () => {
    const t = await buildTeam(h);
    expect(await h.fail(t.managerId, 'leaveTeam', { teamId: t.teamId })).toBe('MANAGER_SUCCESSION_REQUIRED');
    expect(await h.fail(t.players.F1.userId, 'transferManager', { membershipId: t.players.F2.membershipId })).toBe('FORBIDDEN');
    await h.run(t.managerId, 'transferManager', { membershipId: t.players.F1.membershipId });
    const roles = await h.sql`select user_id, manager_role from public.team_memberships where team_id = ${t.teamId} and manager_role is not null`;
    expect(Object.fromEntries(roles.map((r) => [r.user_id, r.manager_role]))).toEqual({
      [t.managerId]: 'ASSISTANT_MANAGER',
      [t.players.F1.userId]: 'MANAGER',
    });
    expect(await notificationsFor(h, t.managerId, 'MANAGER_SUCCESSION')).toHaveLength(1);
    await expect(
      h.sql`update public.team_memberships set manager_role = 'MANAGER' where team_id = ${t.teamId} and user_id = ${t.managerId}`,
    ).rejects.toThrow(/team_memberships_one_manager/);
    expect(await h.fail(t.managerId, 'deleteTeam', { teamId: t.teamId })).toBe('FORBIDDEN');
  });

  it('#32 Assistants remove themselves but not other Assistants', async () => {
    const t = await buildTeam(h);
    await h.run(t.managerId, 'assignAssistant', { membershipId: t.players.F1.membershipId });
    await h.run(t.players.F1.userId, 'assignAssistant', { membershipId: t.players.F2.membershipId });
    expect(await h.fail(t.players.F1.userId, 'removeAssistant', { membershipId: t.players.F2.membershipId })).toBe('FORBIDDEN');
    expect(await h.fail(t.players.F1.userId, 'removeMember', { membershipId: t.players.F2.membershipId })).toBe('FORBIDDEN');
    await h.run(t.players.F1.userId, 'removeAssistant', { membershipId: t.players.F1.membershipId });
    await h.run(t.managerId, 'removeAssistant', { membershipId: t.players.F2.membershipId });
    const left = await h.sql`select 1 from public.team_memberships where team_id = ${t.teamId} and manager_role = 'ASSISTANT_MANAGER'`;
    expect(left).toHaveLength(0);
  });
});

describe('Invariants and visibility (#36–#40)', () => {
  it('#36 only YES, NO and NO_RESPONSE exist, in the database and the API', async () => {
    const [{ values }] = await h.sql`select enum_range(null::public.attendance_response)::text[] as values`;
    expect(values).toEqual(['YES', 'NO', 'NO_RESPONSE']);
    const t = await buildTeam(h);
    const eventId = await releasedGame(h, t);
    const forbiddenWord = ['MA', 'YBE'].join('');
    expect(await h.fail(t.players.F1.userId, 'respondAttendance', { eventId, response: forbiddenWord })).toBe('INVALID_INPUT');
    await expect(h.sql`update public.event_roster_players set response = ${forbiddenWord} where event_id = ${eventId}`).rejects.toThrow(
      /invalid input value for enum/,
    );
  });

  it('#36 the word never appears in source, schema or docs outside the spec itself', () => {
    const root = new URL('../../', import.meta.url).pathname;
    const pattern = new RegExp(['ma', 'ybe'].join(''), 'i');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (['node_modules', '.git', 'spec', '.expo'].includes(name)) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|sql|md|json|toml)$/.test(name) && pattern.test(readFileSync(path, 'utf8'))) hits.push(path.slice(root.length));
      }
    };
    walk(root);
    expect(hits.filter((p) => p !== 'package-lock.json')).toEqual([]);
  });

  it('#37 #38 players cannot read callup rankings, pools, targets or Positions', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']], settings: { callupMode: 'ADVANCED' } });
    await h.run(t.managerId, 'setCallupPoolOrder', { teamId: t.teamId, poolKey: t.pos.Forward, userIds: [t.players.CF1.userId] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.D1.userId, 'respondAttendance', { eventId, response: 'NO' });

    const managerView = await h.asUser(t.managerId, async (tx) => ({
      pools: (await tx`select * from public.callup_pool_entries`).length,
      invites: (await tx`select target_position_id, rank from public.callup_invitations where event_id = ${eventId}`).length,
      positions: (await tx`select * from public.member_positions`).length,
    }));
    expect(managerView).toEqual({ pools: 1, invites: 1, positions: 12 });

    for (const viewer of [t.players.F1.userId, t.players.CF1.userId]) {
      const playerView = await h.asUser(viewer, async (tx) => ({
        pools: (await tx`select * from public.callup_pool_entries`).length,
        invites: (await tx`select * from public.callup_invitations`).length,
        memberPositions: (await tx`select * from public.member_positions`).length,
        eventPositions: (await tx`select * from public.event_roster_positions`).length,
        roster: (await tx`select user_id from public.event_roster_players where event_id = ${eventId}`).length,
      }));
      expect(playerView).toEqual({ pools: 0, invites: 0, memberPositions: 0, eventPositions: 0, roster: 12 });
    }
  });

  it('#39 a callup receives exactly the same invitation as a regular player', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    const [regular] = await notificationsFor(h, t.players.F2.userId, 'EVENT_INVITATION');
    const [callup] = await notificationsFor(h, t.players.CF1.userId, 'EVENT_INVITATION');
    expect(callup).toEqual(regular);
    expect(JSON.stringify(callup)).not.toMatch(/callup/i);
  });

  it('#40 an accepted callup is indistinguishable from an accepted player in what players can read', async () => {
    const t = await buildTeam(h, { callups: [['CF1', 'Forward']] });
    const eventId = await releasedGame(h, t);
    await everyoneYes(h, t, eventId);
    await h.run(t.players.F1.userId, 'respondAttendance', { eventId, response: 'NO' });
    await h.run(t.players.CF1.userId, 'respondAttendance', { eventId, response: 'YES' });

    await expect(h.asUser(t.players.F2.userId, (tx) => tx`select source from public.event_roster_players`)).rejects.toThrow(/permission denied/);
    const rows = await h.asUser(t.players.F2.userId, (tx) =>
      tx`select user_id, response, response_origin, reason, pending_since from public.event_roster_players where event_id = ${eventId} and removed_at is null`,
    );
    const strip = (r: Record<string, unknown>) => ({ ...r, user_id: undefined });
    expect(strip(rows.find((r) => r.user_id === t.players.CF1.userId)!)).toEqual(strip(rows.find((r) => r.user_id === t.players.F2.userId)!));
  });

  it('players cannot write attendance directly around the rules', async () => {
    const t = await buildTeam(h);
    const eventId = await releasedGame(h, t);
    await h.asUser(t.players.F1.userId, (tx) => tx`update public.event_roster_players set response = 'YES' where event_id = ${eventId}`);
    expect((await rosterRow(h, eventId, t.players.F1.userId)).response).toBe('NO_RESPONSE');
    await expect(
      h.asUser(t.players.F1.userId, (tx) => tx`update public.notifications set title = 'x' where user_id = ${t.players.F1.userId}`),
    ).rejects.toThrow(/permission denied/);
  });

  it('decline reasons are capped at 75 characters by the database too', async () => {
    const t = await buildTeam(h);
    const eventId = await releasedGame(h, t);
    await expect(
      h.sql`update public.event_roster_players set response = 'NO', reason = ${'x'.repeat(76)} where event_id = ${eventId} and user_id = ${t.players.F1.userId}`,
    ).rejects.toThrow(/event_roster_players_reason_check/);
  });
});

describe('HTTP API', () => {
  const call = (body: unknown, token: string | null) =>
    handleApi(
      new Request('http://local/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
        body: JSON.stringify(body),
      }),
      { sql: h.sql, authenticate: async (tok) => (tok.startsWith('user:') ? tok.slice(5) : null), now: () => DEFAULT_NOW },
    );

  it('rejects anonymous calls and unknown commands', async () => {
    expect((await call({ command: 'createTeam', params: {} }, null)).status).toBe(401);
    const res = await call({ command: 'dropEverything' }, `user:${await h.user('X')}`);
    expect(res.status).toBe(404);
  });

  it('maps domain errors to readable responses', async () => {
    const t = await buildTeam(h);
    const res = await call({ command: 'deleteTeam', params: { teamId: t.teamId } }, `user:${t.players.F1.userId}`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: { code: 'FORBIDDEN', message: 'Only the Team Manager can do this.' } });
  });

  it('runs a command end to end', async () => {
    const manager = await h.user('API Manager');
    const res = await call({ command: 'createTeam', params: { name: 'API Team', timezone: 'America/Vancouver' } }, `user:${manager}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.data.teamId).toBe('string');
  });
});
