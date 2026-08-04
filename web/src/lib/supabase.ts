import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** These are inlined by Vite at BUILD time, not read at runtime — a deploy whose
 * build ran without them produces a bundle that can never reach Supabase. We
 * surface that as a readable screen (see main.tsx) instead of throwing here,
 * because a module-level throw crashes before React mounts and renders a blank
 * page with no clue as to why. */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient<Database>(
  url || "https://not-configured.supabase.co",
  anonKey || "not-configured",
);
