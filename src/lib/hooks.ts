import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';
import { supabase } from './supabase';

export interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/** Loads data when the screen gains focus and whenever deps change. */
export function useLoader<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      setError(null);
      setData(await loadRef.current());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => {
      void reload();
    }, [reload, ...deps]),
  );
  return { data, error, loading, reload };
}

let channelSeq = 0;

/**
 * Re-runs `onChange` whenever rows change in the given tables for this filter (spec §58). Realtime
 * respects row-level security, so manager-only tables only stream to Managers.
 */
export function useRealtime(channel: string, subscriptions: { table: string; filter?: string }[], onChange: () => void): void {
  const handler = useRef(onChange);
  handler.current = onChange;
  const key = JSON.stringify(subscriptions);
  useEffect(() => {
    const subs = JSON.parse(key) as { table: string; filter?: string }[];
    if (!subs.length) return;
    // supabase.channel() returns an existing channel with the same topic, and removeChannel() is
    // async, so a quick remount would get the old, already-subscribed channel. Keep topics unique.
    let ch = supabase.channel(`${channel}:${++channelSeq}`);
    for (const s of subs) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: s.table, filter: s.filter }, () => handler.current());
    }
    ch.subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [channel, key]);
}

/** Wraps an async action with busy and error state for buttons. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(errorMessage(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
