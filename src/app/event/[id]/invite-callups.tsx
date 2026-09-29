import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { CallupSelectionMethod } from '../../../domain/index.ts';
import { useEventData } from '../../../features/event/useEventData';
import { api } from '../../../lib/api';
import type { CallupCandidate } from '../../../lib/data';
import { useAction, useLoader } from '../../../lib/hooks';
import { Avatar } from '../../../ui/Avatar';
import { Badge, Button, Card, CheckRow, Empty, ErrorText, FieldLabel, ListRow, Loading, Notice, Screen, SearchField, Segmented, SuccessState } from '../../../ui/components';
import { font, space } from '../../../ui/theme';
import { TeamAccent } from '../../../ui/TeamAccent';

/**
 * Wireframes 3B/8D "Invite Callups" and 3C/8E "Invitations sent": the Team's callups, with the ones
 * the chosen method suggests for the open spots already ticked. The Manager decides who gets asked.
 */
export default function InviteCallups() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, error: loadError, loading, teamsLoading, membership, manager } = useEventData(id);
  const [method, setMethod] = useState<CallupSelectionMethod | null>(null);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [query, setQuery] = useState('');
  const [sent, setSent] = useState<CallupCandidate[] | null>(null);
  const { busy, error, run } = useAction();

  const team = membership?.team;
  const activeMethod = method ?? team?.callup_selection_method ?? 'RANDOMIZED_ROTATION';
  const plan = useLoader(async () => {
    if (!manager) return null;
    const result = await api<{ spots: number; candidates: CallupCandidate[] }>('getCallupCandidates', { eventId: id, method: activeMethod });
    return { ...result, method: activeMethod };
  }, [id, manager, activeMethod]);
  // Tick the suggestions when a method's list arrives, but never undo the Manager's own ticks on a reload.
  const [tickedFor, setTickedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!plan.data || plan.data.method !== activeMethod || tickedFor === activeMethod) return;
    setChosen(new Set(plan.data.candidates.filter((c) => c.suggested).map((c) => c.userId)));
    setTickedFor(activeMethod);
  }, [plan.data, activeMethod, tickedFor]);

  if (teamsLoading || (loading && !data)) return <Loading />;
  if (!data || !membership || !team) return <Empty title="Event not found" body={loadError ?? undefined} />;
  if (!manager) return <Empty title="Callups are invited by Managers" />;

  const positionName = new Map((data.team?.positions ?? []).map((p) => [p.id, p.name]));
  const avatars = new Map((data.team?.members ?? []).map((m) => [m.user_id, m.avatar_path]));
  const candidates = (plan.data?.candidates ?? []).filter((c) => c.displayName.toLowerCase().includes(query.trim().toLowerCase()));
  const picked = chosen ?? new Set<string>();
  const spots = plan.data?.spots ?? 0;

  const toggle = (userId: string) => {
    const next = new Set(picked);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setChosen(next);
  };
  const send = () =>
    run(async () => {
      const ids = [...picked];
      await api('inviteCallups', { eventId: id, userIds: ids });
      setSent((plan.data?.candidates ?? []).filter((c) => ids.includes(c.userId)));
    });

  if (sent) {
    return (
      <TeamAccent color={team.accent_color}>
        <Screen
          footer={
            <>
              <Button label="View Callup List" onPress={() => router.back()} />
              <Button
                label="Invite More Callups"
                variant="secondary"
                onPress={() => {
                  setSent(null);
                  setTickedFor(null);
                  void plan.reload();
                }}
              />
            </>
          }
        >
          <SuccessState title="Invitations sent!" body={`${sent.length} ${sent.length === 1 ? 'player has' : 'players have'} been notified.`} />
          <Card flush>
            {sent.map((c, i) => (
              <ListRow
                key={c.userId}
                first={i === 0}
                title={c.displayName}
                subtitle={c.positionId ? positionName.get(c.positionId) : null}
                leading={<Avatar name={c.displayName} path={avatars.get(c.userId)} size={32} />}
                right={<Badge label="Pending" tone="attention" />}
              />
            ))}
          </Card>
        </Screen>
      </TeamAccent>
    );
  }

  return (
    <TeamAccent color={team.accent_color}>
      <Screen
        footer={
          <>
            <Button label={`Send Invitations (${picked.size})`} busy={busy} disabled={!picked.size} onPress={() => void send()} />
            <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
          </>
        }
      >
        <View style={{ gap: 6 }}>
          <FieldLabel label="Callup Selection Mode" />
          <Segmented
            options={[
              { value: 'RANDOMIZED_ROTATION', label: 'Random Callup' },
              { value: 'PREDETERMINED_SEQUENCE', label: 'Simple Listed Order' },
            ]}
            value={activeMethod}
            onChange={(m) => setMethod(m)}
          />
        </View>
        <Text style={font.small}>
          {`Select players to invite (${spots} ${spots === 1 ? 'spot' : 'spots'} available). The ${
            activeMethod === 'RANDOMIZED_ROTATION' ? 'random pick, favouring those who have played least,' : 'callup list order'
          } is ticked for you.`}
        </Text>
        <SearchField value={query} onChangeText={setQuery} />
        <Text style={[font.heading, { marginBottom: -space.sm }]}>{`Available Callup Players (${plan.data?.candidates.filter((c) => !c.onEvent).length ?? 0})`}</Text>
        {plan.loading && !plan.data ? (
          <Loading />
        ) : (
          <Card flush>
            {candidates.length ? (
              candidates.map((c, i) => (
                <CheckRow
                  key={c.userId}
                  first={i === 0}
                  checked={picked.has(c.userId)}
                  disabled={c.onEvent}
                  onPress={() => toggle(c.userId)}
                  title={c.displayName}
                  subtitle={[c.positionId ? positionName.get(c.positionId) : 'No Position', c.onEvent ? 'Already on this Event' : null, c.unavailable ? 'Marked unavailable' : null]
                    .filter(Boolean)
                    .join(' · ')}
                  leading={<Avatar name={c.displayName} path={avatars.get(c.userId)} size={32} />}
                  right={c.suggested ? <Badge label="Suggested" tone="primary" /> : undefined}
                />
              ))
            ) : (
              <Text style={[font.small, { paddingVertical: space.lg }]}>
                {plan.data?.candidates.length ? 'No one matches.' : 'No callups on this Team yet. Set a member as a Callup under Members & Governance.'}
              </Text>
            )}
          </Card>
        )}
        <Notice tone="primary">Invited callups get a callup notification and can answer Yes, No or Maybe.</Notice>
        <ErrorText error={error ?? plan.error} />
      </Screen>
    </TeamAccent>
  );
}
