// Default Roster (spec §11): quantities per base Position and Goalie. Hybrids fill base needs.
import { useState } from 'react';
import { Text, View } from 'react-native';
import { sortPositions } from '../../domain/index.ts';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { Button, Card, ErrorText, Notice, Stepper } from '../../ui/components';
import { font } from '../../ui/theme';
import type { SectionProps } from './types';

export function DefaultRosterSettings({ membership, detail, reload }: SectionProps) {
  const editable = sortPositions(detail.positions).filter((p) => p.kind === 'BASE' || (p.kind === 'GOALIE' && detail.config.goalieEnabled));
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(editable.map((p) => [p.id, detail.requirements.find((r) => r.positionId === p.id)?.quantity ?? 0])),
  );
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const total = Object.values(values).reduce((a, b) => a + b, 0);

  const save = () =>
    run(async () => {
      setSaved(false);
      await api('setDefaultRoster', {
        teamId: membership.team.id,
        requirements: Object.entries(values)
          .filter(([, q]) => q > 0)
          .map(([positionId, quantity]) => ({ positionId, quantity })),
      });
      await reload();
      setSaved(true);
    });

  return (
    <>
      <Card>
        {editable.map((p) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={font.body}>{p.name}</Text>
            <Stepper label={p.name} value={values[p.id] ?? 0} onChange={(v) => setValues({ ...values, [p.id]: v })} />
          </View>
        ))}
        <Text style={font.small}>{total === 0 ? 'No limits: everyone who says Yes attends.' : `${total} players per Event.`}</Text>
      </Card>
      <Text style={font.small}>Hybrid players count toward whichever of their Positions needs them. Existing Events keep the roster they were created with.</Text>
      <ErrorText error={error} />
      <Button label="Save" busy={busy} onPress={() => void save()} />
      {saved && <Notice tone="positive" title="Saved" />}
    </>
  );
}
