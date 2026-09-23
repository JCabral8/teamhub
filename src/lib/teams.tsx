// The signed-in user's Teams and which one the Team tab is showing.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { loadMyMemberships, type MyMembership } from './data';

interface TeamsState {
  memberships: MyMembership[];
  /** Active memberships only. */
  active: MyMembership[];
  loading: boolean;
  error: string | null;
  selected: MyMembership | null;
  select: (teamId: string) => void;
  reload: () => Promise<void>;
}

const TeamsContext = createContext<TeamsState | null>(null);
const STORAGE_KEY = 'teamhub.selectedTeam';

export function TeamsProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const [memberships, setMemberships] = useState<MyMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setMemberships(await loadMyMemberships(userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your Teams.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void reload();
    AsyncStorage.getItem(STORAGE_KEY)
      .then(setSelectedId)
      .catch(() => undefined);
  }, [reload]);

  const select = useCallback((teamId: string) => {
    setSelectedId(teamId);
    AsyncStorage.setItem(STORAGE_KEY, teamId).catch(() => undefined);
  }, []);

  const value = useMemo<TeamsState>(() => {
    const active = memberships.filter((m) => m.status === 'ACTIVE');
    const selected = active.find((m) => m.team.id === selectedId) ?? active[0] ?? null;
    return { memberships, active, loading, error, selected, select, reload };
  }, [memberships, loading, error, selectedId, select, reload]);

  return <TeamsContext.Provider value={value}>{children}</TeamsContext.Provider>;
}

export function useTeams(): TeamsState {
  const ctx = useContext(TeamsContext);
  if (!ctx) throw new Error('useTeams must be used inside TeamsProvider');
  return ctx;
}

export const isManagerOf = (m: MyMembership | null | undefined) => !!m?.manager_role;
