// Client for the `api` Edge Function. Every write in the app goes through here.
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Run the function next to the database: a command makes many small queries, and from the nearest
// edge region each one crosses the continent. Passed as a query parameter because the `region`
// option also sends an x-region header, which the function's CORS rules don't allow on web.
const REGION = process.env.EXPO_PUBLIC_SUPABASE_FUNCTION_REGION;
const API_PATH = REGION ? `api?forceFunctionRegion=${encodeURIComponent(REGION)}` : 'api';

export async function api<T = unknown>(command: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(API_PATH, { body: { command, params } });
  if (error) {
    let body: { error?: { code?: string; message?: string } } | undefined;
    try {
      body = await (error as { context?: Response }).context?.json();
    } catch {
      body = undefined;
    }
    throw new ApiError(body?.error?.code ?? 'NETWORK', body?.error?.message ?? 'Could not reach TeamHub. Check your connection and try again.');
  }
  return (data as { data: T }).data;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return /failed to fetch|network request failed/i.test(err.message) ? 'Could not reach TeamHub. Check your connection and try again.' : err.message;
  return 'Something went wrong.';
}
