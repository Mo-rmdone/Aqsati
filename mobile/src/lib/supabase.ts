import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { Database } from './database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Web persists the session in localStorage (supabase-js default when storage is
// undefined); native uses AsyncStorage. Guard for SSR/Node where window is absent.
const storage = Platform.OS === 'web' ? undefined : AsyncStorage;

export const supabase = createClient<Database>(url || 'http://localhost', anonKey || 'missing-anon-key', {
  auth: {
    storage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
