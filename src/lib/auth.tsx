import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  userId: string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, userId: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, userId: null, loading: true });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({ session: data.session, userId: data.session?.user.id ?? null, loading: false });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, userId: session?.user.id ?? null, loading: false });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Supabase auth messages are technical; say what the person should do instead. */
export function authError(err: { message: string; code?: string }): Error {
  const m = err.message;
  if (err.code === 'invalid_credentials' || /invalid login credentials/i.test(m)) return new Error('Wrong email or password.');
  if (err.code === 'user_already_exists' || /already registered/i.test(m)) return new Error('An account with this email already exists. Sign in instead.');
  if (err.code === 'email_address_invalid' || /validate email|invalid format/i.test(m)) return new Error('Enter a valid email address.');
  if (err.code === 'weak_password' || /password should/i.test(m)) return new Error('Choose a stronger password: at least 8 characters.');
  if (err.code === 'otp_disabled' || /signups not allowed/i.test(m)) return new Error('No account uses this email. Create an account first.');
  if (err.code === 'over_email_send_rate_limit' || /only request this after|email rate limit/i.test(m)) return new Error('We sent you an email recently. Check your inbox, or wait a minute and try again.');
  if (err.code === 'over_request_rate_limit' || /rate limit|too many/i.test(m)) return new Error('Too many attempts. Wait a minute and try again.');
  if (err.code === 'same_password' || /different from the old password/i.test(m)) return new Error('Choose a password different from your current one.');
  if (err.code === 'reauthentication_needed') return new Error('For security, sign out, sign back in, then change your password.');
  if (err.code === 'session_not_found' || /session missing/i.test(m)) return new Error('This link has expired. Ask for a new one from the sign-in page.');
  return new Error(m);
}
