// Calendar subscription feed: GET ?token=… returns the person's TeamHub schedule as iCalendar.
// Calendar apps can't sign in, so this function skips JWT checks; the secret token is the key.
import postgres from 'postgres';
import { handleCalendar } from '../../../src/server/http.ts';

// Same connection limits as the api function: instances come and go, so keep few, short-lived connections.
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2, idle_timeout: 5, max_lifetime: 60, onnotice: () => {} });
addEventListener('beforeunload', () => {
  void sql.end({ timeout: 0 });
});
const APP_URL = Deno.env.get('APP_URL') ?? 'https://teamhub.expo.app';

Deno.serve((req) => handleCalendar(req, { sql, appUrl: APP_URL, log: (entry) => console.log(JSON.stringify(entry)) }));
