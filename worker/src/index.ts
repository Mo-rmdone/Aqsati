// Keepalive only. The free Supabase tier pauses a project after ~7 days with no
// API traffic, so this pings once a day with the public anon key. RLS returns
// zero rows for an anonymous caller — the request just has to reach Postgres.
// The nightly overdue flip runs inside the database via pg_cron
// (0011_cron_flip_overdue.sql), so no service-role key lives here.
export default {
  async scheduled(_event: ScheduledEvent, env: Env) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/tenant?select=id&limit=1`, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) throw new Error(`keepalive ping failed: ${res.status}`);
  },
};
interface Env { SUPABASE_URL: string; SUPABASE_ANON_KEY: string }
