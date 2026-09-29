import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { sortPositions } from '../../../domain/index.ts';
import { EventHeader } from '../../../features/event/EventHeader';
import { hasCustomRequirements, useEventData } from '../../../features/event/useEventData';
import { api } from '../../../lib/api';
import { useAction } from '../../../lib/hooks';
import { Button, Card, Empty, ErrorText, Loading, Notice, Screen, StepperRow, ToggleRow } from '../../../ui/components';
import { font } from '../../../ui/theme';
import { TeamAccent } from '../../../ui/TeamAccent';

/** Wireframe 2D "Roster Override (Per Event)": this Event's Position quantities (spec §21). */
export default function EventRosterSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, error: loadError, loading, teamsLoading, membership, manager, reload } = useEventData(id);
  const [useDefault, setUseDefault] = useState<boolean | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const [callupSpots, setCallupSpots] = useState(0);
  const { busy, error, run } = useAction();

  const team = data?.team;
  const editable = team ? sortPositions(team.positions).filter((p) => p.kind === 'BASE' || (p.kind === 'GOALIE' && team.config.goalieEnabled)) : [];
  useEffect(() => {
    if (!data?.team || useDefault !== null) return;
    setUseDefault(!hasCustomRequirements(data.detail, data.team, membership!));
    setCallupSpots(data.detail.event.callup_spots);
    setValues(Object.fromEntries(editable.map((p) => [p.id, data.detail.requirements.find((r) => r.positionId === p.id)?.quantity ?? 0])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (teamsLoading || (loading && !data)) return <Loading />;
  if (!data || !membership) return <Empty title="Event not found" body={loadError ?? undefined} />;
  if (!manager || !team) return <Empty title="Only Managers can change roster settings" />;
  if (useDefault === null) return <Loading />;

  const defaults = Object.fromEntries(editable.map((p) => [p.id, team.requirements.find((r) => r.positionId === p.id)?.quantity ?? 0]));
  const defaultSpots = membership.team.include_callups ? membership.team.callup_spots : 0;
  const shown = useDefault ? defaults : values;
  const spots = useDefault ? defaultSpots : callupSpots;

  const save = () =>
    run(async () => {
      await api('setEventRequirements', {
        eventId: id,
        requirements: Object.entries(shown)
          .filter(([, q]) => q > 0)
          .map(([positionId, quantity]) => ({ positionId, quantity })),
        callupSpots: spots,
      });
      await reload();
      router.back();
    });

  return (
    <TeamAccent color={membership.team.accent_color}>
      <Screen footer={<Button label="Save for This Event" busy={busy} onPress={() => void save()} />}>
        <EventHeader event={data.detail.event} team={membership.team} compact />
        <Card>
          <ToggleRow
            label="Use Default Requirements"
            hint={useDefault ? 'This Event uses the Team default roster.' : 'Override the default roster requirements for this Event only.'}
            value={useDefault}
            onChange={setUseDefault}
          />
        </Card>
        <Card>
          <Text style={font.heading}>Position Requirements (This Event)</Text>
          {editable.map((p) =>
            useDefault ? (
              <StepperRow key={p.id} label={p.name} value={defaults[p.id] ?? 0} onChange={() => undefined} min={defaults[p.id]} max={defaults[p.id]} />
            ) : (
              <StepperRow key={p.id} label={p.name} value={values[p.id] ?? 0} onChange={(v) => setValues({ ...values, [p.id]: v })} />
            ),
          )}
        </Card>
        <Card>
          <Text style={font.heading}>Callup Spots (This Event)</Text>
          {useDefault ? (
            <Text style={font.body}>{defaultSpots ? `${defaultSpots} callup ${defaultSpots === 1 ? 'spot' : 'spots'} (Team default)` : 'No callup spots (Team default)'}</Text>
          ) : (
            <>
              <ToggleRow label="Include callups" hint="Extra roster spots only callups can take." value={callupSpots > 0} onChange={(v) => setCallupSpots(v ? Math.max(1, callupSpots) : 0)} />
              {callupSpots > 0 && <StepperRow label="Number of callup spots" value={callupSpots} min={1} max={20} onChange={setCallupSpots} />}
            </>
          )}
        </Card>
        <Notice tone="primary">Overrides apply to this Event only and do not change your Team defaults.</Notice>
        <ErrorText error={error} />
      </Screen>
    </TeamAccent>
  );
}
