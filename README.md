# TeamHub

Cross-platform (iOS/Android) team management app for amateur sports teams: rosters, Positions, Events, attendance, callups and statistics.

The V1 specification lives in [`docs/spec/`](docs/spec). Where the spec left a gap, the chosen behavior is listed in [`docs/decisions.md`](docs/decisions.md).

## Layout

| Path | What it holds |
|---|---|
| `src/domain/` | Pure TypeScript business rules: Positions, roster capacity, attendance, scheduling, callups, governance, statistics, notification text. No I/O. Shared by the app and the server. |
| `src/server/` | Services that load state, apply the domain rules and persist the result inside one transaction. `commands.ts` is the full command API. |
| `supabase/migrations/` | Schema, constraints, row-level security, realtime publication and the per-minute job schedule. |
| `supabase/functions/api` | Edge Function for every client write: `POST { command, params }` with the user's access token. |
| `supabase/functions/jobs` | Edge Function that pg_cron calls every minute for scheduled releases, "ready to send" notices and reminders. |
| `tests/domain/` | Unit tests for the domain rules. |
| `tests/server/` | Integration tests that run the real migrations and services against Postgres. Together with the unit tests they cover all 40 scenarios in spec §61. |

The Expo app screens come next, built on the same domain module.

## Development

```bash
npm install
npm run typecheck
npm run test:unit            # no database needed
npm run test:db              # needs Postgres 16; see below
npm test                     # everything
```

The database tests create and drop a scratch database. They connect to `TEST_DATABASE_URL`, which defaults to `postgres://postgres:postgres@localhost:5432/postgres`.

## Deploying the backend

1. Create a Supabase project and link it: `npx supabase link --project-ref <ref>`.
2. Apply migrations: `npx supabase db push`.
3. Deploy functions: `npx supabase functions deploy api` and `npx supabase functions deploy jobs`.
4. For scheduled releases, add two Vault secrets in the project: `project_url` (for example `https://<ref>.supabase.co`) and `service_role_key`. The per-minute job reads them on every run, so nothing else needs re-running.

## Client rules

- Every write goes through the `api` function. Tables are read-only to clients apart from profile name and Position preference, availability dates, notification read state and push tokens.
- Select columns by name from `event_roster_players`. The `source` column is hidden from clients so players can't tell callups apart.
- Manager-only data (member Positions, Event planning Positions, callup pools and invitations) is readable only by that Team's Managers.
