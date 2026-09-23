import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { isValidTimeZone, type RosterRole } from '../../domain/index.ts';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { useTeams } from '../../lib/teams';
import { Button, Card, Chips, ErrorText, Field, Screen } from '../../ui/components';
import { deviceTimeZone } from '../../ui/format';
import { font, space } from '../../ui/theme';

export default function NewTeam() {
  const router = useRouter();
  const teams = useTeams();
  const [name, setName] = useState('');
  const [arena, setArena] = useState('');
  const [defaultLocation, setDefaultLocation] = useState('');
  const [timezone, setTimezone] = useState(deviceTimeZone());
  const [rosterRole, setRosterRole] = useState<RosterRole>('NONE');
  const { busy, error, setError, run } = useAction();

  const submit = () =>
    run(async () => {
      if (!name.trim()) return setError('Enter a Team name.');
      if (!isValidTimeZone(timezone.trim())) return setError('Enter a valid time zone, such as America/Toronto.');
      const { teamId } = await api<{ teamId: string }>('createTeam', {
        name: name.trim(),
        timezone: timezone.trim(),
        arena: arena.trim() || null,
        defaultLocation: defaultLocation.trim() || null,
        rosterRole,
      });
      await teams.reload();
      teams.select(teamId);
      router.replace('/team');
    });

  return (
    <Screen>
      <Card>
        <Field label="Team name" value={name} onChangeText={setName} maxLength={80} />
        <Field label="Arena (optional)" value={arena} onChangeText={setArena} maxLength={120} />
        <Field label="Default location (optional)" value={defaultLocation} onChangeText={setDefaultLocation} maxLength={200} hint="Used for new Events. Leave blank to use the arena." />
        <Field label="Time zone" value={timezone} onChangeText={setTimezone} autoCapitalize="none" autoCorrect={false} hint="Event and attendance times use this time zone." />
      </Card>
      <Card>
        <View style={{ gap: space.sm }}>
          <Text style={font.heading}>Will you play on this Team?</Text>
          <Chips
            options={[
              { value: 'NONE', label: 'No, managing only' },
              { value: 'ROSTER', label: 'Yes, on the roster' },
              { value: 'CALLUP', label: 'As a callup' },
            ]}
            value={rosterRole}
            onChange={setRosterRole}
          />
        </View>
        <Text style={font.small}>The Team starts with Goalie, Forward, Defence and Forward/Defence Positions and a default roster of 1 Goalie, 6 Forwards and 4 Defence. You can change these in Team Settings.</Text>
      </Card>
      <ErrorText error={error} />
      <Button label="Create Team" busy={busy} onPress={() => void submit()} />
    </Screen>
  );
}
