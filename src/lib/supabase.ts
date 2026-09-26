import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False until EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set (see .env.example). */
export const isConfigured = Boolean(url && anonKey);

/**
 * True when this page load came from a "reset your password" email, so the app can ask for a new
 * password. Read here, before the client below takes the session out of the address.
 */
export const openedFromPasswordReset =
  Platform.OS === 'web' && typeof window !== 'undefined' && /(^|[#&])type=recovery(&|$)/.test(window.location.hash);

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'not-configured', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // On the web, an emailed sign-in link lands on the site with the session in the URL.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
