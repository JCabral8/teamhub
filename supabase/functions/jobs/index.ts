// Scheduled attendance releases, "ready to send" notices, reminders and push delivery. Called every minute by pg_cron.
import postgres from 'postgres';
import { handleJobs } from '../../../src/server/http.ts';
import { expoPushSender } from '../../../src/server/push.ts';

// Instances start and stop constantly (often one per request). Keep few connections, drop idle ones
// quickly and close them on shutdown: connections left open by stopped instances used up every
// database slot ("remaining connection slots are reserved for roles with the SUPERUSER attribute").
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2, idle_timeout: 5, max_lifetime: 60, onnotice: () => {} });
addEventListener('beforeunload', () => {
  void sql.end({ timeout: 0 });
});
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve((req) =>
  handleJobs(req, {
    sql,
    isAuthorized: (r) => r.headers.get('authorization') === `Bearer ${SERVICE_ROLE_KEY}`,
    push: expoPushSender(fetch, Deno.env.get('EXPO_ACCESS_TOKEN') ?? undefined),
    log: (entry) => console.log(JSON.stringify(entry)),
  }),
);
