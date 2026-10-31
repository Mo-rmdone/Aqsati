import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { Database } from './database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False when the env vars are missing; the root layout then shows a setup screen instead of the app. */
export const isSupabaseConfigured = Boolean(url && anonKey);

// Web persists the session in localStorage (supabase-js default when storage is
// undefined); native uses AsyncStorage.
const storage = Platform.OS === 'web' ? undefined : AsyncStorage;

// Placeholders are https so a misconfigured build can never talk to a plain-http origin.
export const supabase = createClient<Database>(
  url || 'https://not-configured.supabase.co',
  anonKey || 'not-configured',
  {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);
