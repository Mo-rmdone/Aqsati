export default {
  async scheduled(_event: ScheduledEvent, env: Env) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/flip_overdue`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) throw new Error(`flip_overdue failed: ${res.status}`);
  },
};
interface Env { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string }
