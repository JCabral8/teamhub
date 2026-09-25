// Command API. Every client write goes through here: POST { command, params } with the user's token.
import postgres from 'postgres';
import { handleApi } from '../../../src/server/http.ts';
import { expoPushSender } from '../../../src/server/push.ts';

// Instances start and stop constantly (often one per request). Keep few connections, drop idle ones
// quickly and close them on shutdown: connections left open by stopped instances used up every
// database slot ("remaining connection slots are reserved for roles with the SUPERUSER attribute").
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2, idle_timeout: 5, max_lifetime: 60, onnotice: () => {} });
addEventListener('beforeunload', () => {
  void sql.end({ timeout: 0 });
});
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

async function authenticate(token: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY } });
  if (!res.ok) return null;
  const user = await res.json();
  return typeof user?.id === 'string' ? user.id : null;
}

const push = expoPushSender(fetch, Deno.env.get('EXPO_ACCESS_TOKEN') ?? undefined);

Deno.serve((req) => handleApi(req, { sql, authenticate, push, log: (entry) => console.log(JSON.stringify(entry)) }));
