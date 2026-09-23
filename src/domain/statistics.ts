import type { AttendanceResponse, RosterSource } from './types.ts';

/** One person's line on one released Event. */
export interface AttendanceRecord {
  userId: string;
  source: RosterSource;
  response: AttendanceResponse;
}

export interface RegularAttendanceStats {
  invitations: number;
  yes: number;
  no: number;
  noResponse: number;
}

export interface CallupAttendanceStats {
  invitations: number;
  accepted: number;
  declined: number;
  noResponse: number;
}

export interface PlayerAttendanceStats {
  userId: string;
  regular: RegularAttendanceStats;
  callup: CallupAttendanceStats;
}

/**
 * Attendance statistics (spec §51). Regular roster and callup attendance are tracked separately.
 * Callers pass records for released Events and current members only, so removed players do not
 * count toward current statistics (spec §52).
 */
export function computeAttendanceStatistics(records: AttendanceRecord[]): PlayerAttendanceStats[] {
  const byUser = new Map<string, PlayerAttendanceStats>();
  for (const r of records) {
    let s = byUser.get(r.userId);
    if (!s) {
      s = {
        userId: r.userId,
        regular: { invitations: 0, yes: 0, no: 0, noResponse: 0 },
        callup: { invitations: 0, accepted: 0, declined: 0, noResponse: 0 },
      };
      byUser.set(r.userId, s);
    }
    if (r.source === 'CALLUP') {
      s.callup.invitations++;
      if (r.response === 'YES') s.callup.accepted++;
      else if (r.response === 'NO') s.callup.declined++;
      else s.callup.noResponse++;
    } else {
      s.regular.invitations++;
      if (r.response === 'YES') s.regular.yes++;
      else if (r.response === 'NO') s.regular.no++;
      else s.regular.noResponse++;
    }
  }
  return [...byUser.values()];
}
