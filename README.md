# TeamHub

Cross-platform (iOS/Android) team management app for amateur sports teams: rosters, Positions, Events, attendance, callups and statistics.

The V1 specification lives in [`docs/spec/`](docs/spec). Where the spec left a gap, the chosen behavior is listed in [`docs/decisions.md`](docs/decisions.md).

## Layout

| Path | What it holds |
|---|---|
| `src/domain/` | Pure TypeScript business rules: Positions, roster capacity, attendance, scheduling, callups, governance, statistics, notification text. No I/O. Shared by the app and the server. |
| `src/server/` | Services that load state, apply the domain rules and persist the result inside one transaction. `commands.ts` is the full command API. `push.ts` delivers notifications to phones. |
| `src/app/` | Expo Router screens: Home, Schedule, Team and Other tabs, Event detail, Event create and edit, Team Settings, join, profile, statistics. |
| `src/features/` | Larger screen parts: Event attendance and roster, Team Settings sections, joining a Team. |
| `src/lib/` | Supabase client, the `api()` command client, auth and Team context, read queries and hooks. |
| `src/ui/` | Shared components, calendar, formatting and design tokens. |
| `supabase/migrations/` | Schema, constraints, row-level security, realtime publication and the per-minute job schedule. |
| `supabase/functions/api` | Edge Function for every client write: `POST { command, params }` with the user's access token. |
| `supabase/functions/jobs` | Edge Function that pg_cron calls every minute for scheduled releases, "ready to send" notices, reminders and push delivery. |
| `tests/domain/` | Unit tests for the domain rules. |
| `tests/server/` | Integration tests that run the real migrations and services against Postgres. Together with the unit tests they cover all 40 scenarios in spec §61. |

## Development

```bash
npm install
npm run typecheck
npm run test:unit            # no database needed
npm run test:db              # needs Postgres 16; see below
npm test                     # everything
```

The database tests create and drop a scratch database. They connect to `TEST_DATABASE_URL`, which defaults to `postgres://postgres:postgres@localhost:5432/postgres`.

### Running the app

1. Copy `.env.example` to `.env` and fill in the Supabase project URL and anon key.
2. `npx expo start`, then open it in Expo Go, a simulator, or the browser (`w`).
3. Push notifications need a development build and an EAS project id (`npx eas-cli@latest init` adds it to `app.json`). Without one the app works and notifications stay in the in-app list.

Shared links use the web app's own address (`https://…/join/<code>`, `https://…/event/<id>`), so they open for anyone with a browser. In a phone build they fall back to the `teamhub://` scheme.

## Deploying

TeamHub runs as a web app on EAS Hosting. Every push to `main` runs `.github/workflows/deploy.yml`: typecheck and unit tests, then migrations and both Edge Functions, then the web app. The secrets and variables it needs are listed at the top of that file. The steps below are the manual equivalent and the one-time project setup.

There are no push notifications on the web. When attendance goes out, a Manager uses **Share to Team Chat** on the Event to post a link to it.

### Web app

1. `npx eas-cli@latest login`, then `npx eas-cli@latest init` to link the Expo project.
2. `npx expo export --platform web`, then `npx eas-cli@latest deploy --prod`.
3. In Supabase, Authentication > URL Configuration: set the Site URL to the web app's address so email confirmation links open it.

### Backend

1. Create a Supabase project and link it: `npx supabase link --project-ref <ref>`.
2. Apply migrations: `npx supabase db push`.
3. Deploy functions: `npx supabase functions deploy api` and `npx supabase functions deploy jobs`.
4. For scheduled releases, add two Vault secrets in the project: `project_url` (for example `https://<ref>.supabase.co`) and `service_role_key`. The per-minute job reads them on every run, so nothing else needs re-running.
5. Optional: if the Expo project has enhanced push security turned on, set `EXPO_ACCESS_TOKEN` as a function secret (`npx supabase secrets set EXPO_ACCESS_TOKEN=...`).

Push messages go out right after the command that created them, and the per-minute job retries anything left over from the last day.

## Client rules

- Every write goes through the `api` function. Tables are read-only to clients apart from profile name and Position preference, availability dates, notification read state and push tokens.
- Select columns by name from `event_roster_players`. The `source` column is hidden from clients so players can't tell callups apart.
- Manager-only data (member Positions, Event planning Positions, callup pools and invitations) is readable only by that Team's Managers.
