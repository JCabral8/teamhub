import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { canDeleteTeam, isValidTimeZone } from '../../domain/index.ts';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAction } from '../../lib/hooks';
import { useTeams } from '../../lib/teams';
import { Button, Card, ErrorText, Field, Notice, useConfirm } from '../../ui/components';
import { font } from '../../ui/theme';
import type { SectionProps } from './types';

export function GeneralSettings({ membership, reload }: SectionProps) {
  const team = membership.team;
  const router = useRouter();
  const { userId } = useAuth();
  const teams = useTeams();
  const [name, setName] = useState(team.name);
  const [arena, setArena] = useState(team.arena ?? '');
  const [location, setLocation] = useState(team.default_location ?? '');
  const [timezone, setTimezone] = useState(team.timezone);
  const [saved, setSaved] = useState(false);
  const save = useAction();
  const del = useAction();
  const confirm = useConfirm();

  const onSave = () =>
    save.run(async () => {
      setSaved(false);
      if (!name.trim()) return save.setError('Enter a Team name.');
      if (!isValidTimeZone(timezone.trim())) return save.setError('Enter a valid time zone, such as America/Toronto.');
      await api('updateTeamSettings', {
        teamId: team.id,
        name: name.trim(),
        arena: arena.trim() || null,
        defaultLocation: location.trim() || null,
        timezone: timezone.trim(),
      });
      await reload();
      setSaved(true);
    });

  const onDelete = async () => {
    if (!(await confirm.ask(`Delete ${team.name}?`, 'The Team, its schedule and its settings disappear for every member.', 'Delete Team', true))) return;
    await del.run(async () => {
      await api('deleteTeam', { teamId: team.id });
      await teams.reload();
      router.dismissTo('/team');
    });
  };

  return (
    <>
      <Card>
        <Field label="Team name" value={name} onChangeText={setName} maxLength={80} />
        <Field label="Arena" value={arena} onChangeText={setArena} maxLength={120} />
        <Field label="Default location" value={location} onChangeText={setLocation} maxLength={200} hint="Fills in the location of new Events. Blank uses the arena." />
        <Field label="Time zone" value={timezone} onChangeText={setTimezone} autoCapitalize="none" autoCorrect={false} />
        <ErrorText error={save.error} />
        <Button label="Save" busy={save.busy} onPress={() => void onSave()} />
        {saved && <Notice tone="positive" title="Saved" />}
      </Card>
      {canDeleteTeam({ userId: userId ?? '', role: membership.manager_role }) && (
        <Card>
          <Text style={font.heading}>Delete Team</Text>
          <Text style={font.small}>Only the Team Manager can delete the Team.</Text>
          <Button label="Delete Team" variant="danger" busy={del.busy} onPress={() => void onDelete()} />
          <ErrorText error={del.error} />
        </Card>
      )}
      {confirm.element}
    </>
  );
}
