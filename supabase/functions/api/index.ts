// Command API. Every client write goes through here: POST { command, params } with the user's token.
import postgres from 'postgres';
import { handleApi } from '../../../src/server/http.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 5, onnotice: () => {} });
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

async function authenticate(token: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY } });
  if (!res.ok) return null;
  const user = await res.json();
  return typeof user?.id === 'string' ? user.id : null;
}

Deno.serve((req) => handleApi(req, { sql, authenticate, log: (entry) => console.log(JSON.stringify(entry)) }));
