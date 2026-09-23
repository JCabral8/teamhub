// Scheduled attendance releases, "ready to send" notices, reminders and push delivery. Called every minute by pg_cron.
import postgres from 'postgres';
import { handleJobs } from '../../../src/server/http.ts';
import { expoPushSender } from '../../../src/server/push.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2, onnotice: () => {} });
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve((req) =>
  handleJobs(req, {
    sql,
    isAuthorized: (r) => r.headers.get('authorization') === `Bearer ${SERVICE_ROLE_KEY}`,
    push: expoPushSender(fetch, Deno.env.get('EXPO_ACCESS_TOKEN') ?? undefined),
    log: (entry) => console.log(JSON.stringify(entry)),
  }),
);
