// Deno entry for the voice-intent edge function (verify_jwt = true).
// Never log the transcript, the API key or the JWT.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  CAP_USD,
  MAX_TEXT,
  buildRequest,
  reserveChargeUsd,
  validateIntent,
} from './logic.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function cairoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 400);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'unauthorized' }, 401);

  let text: unknown;
  try {
    text = (await req.json())?.text;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (typeof text !== 'string' || text.trim() === '') return json({ error: 'bad_request' }, 400);
  if (text.length > MAX_TEXT) return json({ error: 'too_long' }, 400);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!apiKey || !url || !anon) {
    // Names only (never values), so the owner can tell which setting is missing.
    const missing = [!apiKey && 'ANTHROPIC_API_KEY', !url && 'SUPABASE_URL', !anon && 'SUPABASE_ANON_KEY'].filter(Boolean);
    return json({ error: 'not_configured', missing }, 503);
  }

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  // Charge the worst case up front; the cap is a server constant, never from the request.
  const { data: ok, error: reserveErr } = await supabase.rpc('voice_reserve', {
    p_cap_usd: CAP_USD,
    p_charge_usd: reserveChargeUsd(),
  });
  if (reserveErr) {
    if (reserveErr.code === '42501') return json({ error: 'unauthorized' }, 401);
    return json({ error: 'ai_unavailable' }, 503);
  }
  if (ok !== true) return json({ error: 'budget_exceeded' }, 402);

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildRequest(text, cairoToday())),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return json({ error: 'ai_unavailable' }, 503);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  // Report tokens (reporting only; the cost was already charged).
  const inTok = Number(data?.usage?.input_tokens);
  const outTok = Number(data?.usage?.output_tokens);
  if (Number.isInteger(inTok) && Number.isInteger(outTok) && inTok >= 0 && outTok >= 0) {
    await supabase.rpc('voice_record', { p_input: inTok, p_output: outTok });
  }

  if (!res.ok || !data) return json({ error: 'ai_unavailable' }, 503);

  const block = Array.isArray(data.content)
    ? data.content.find((b: any) => b?.type === 'tool_use' && b?.name === 'intent')
    : undefined;
  return json({ intent: validateIntent(block?.input) });
});
