// "Invite Callups": runs callup selection for the Event's open spots (spec §38–§42, decision 4).
import { useState } from 'react';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';

export function useInviteCallups(eventId: string, onChanged: () => void) {
  const [result, setResult] = useState<string | null>(null);
  const action = useAction();
  const invite = () =>
    action.run(async () => {
      setResult(null);
      const { invited } = await api<{ invited: number }>('runCallupSelection', { eventId });
      setResult(
        invited
          ? `Invitations sent to ${invited} ${invited === 1 ? 'callup' : 'callups'}. They've been notified.`
          : 'No callups invited. Either no spots are open, or no callups are available for them.',
      );
      onChanged();
    });
  return { invite, result, busy: action.busy, error: action.error };
}
