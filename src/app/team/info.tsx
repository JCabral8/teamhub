import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSelectedTeam } from '../../features/team/useSelectedTeam';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import { shareOrCopy } from '../../lib/share';
import { useAccent } from '../../ui/accent';
import { TeamLogo } from '../../ui/Avatar';
import { Button, Card, Empty, ErrorText, ListRow, Loading, Screen, useConfirm } from '../../ui/components';
import { joinLink } from '../../ui/format';
import { font, space } from '../../ui/theme';

/** Team tab → Team Information: the Team's details, the invite link, and leaving. */
export default function TeamInfo() {
  const router = useRouter();
  const { team, manager, data, error, loading, teams } = useSelectedTeam();
  const accent = useAccent();
  const [copied, setCopied] = useState(false);
  const leave = useAction();
  const confirm = useConfirm();

  if (loading && !data) return <Loading />;
  if (!team) return <Empty title="No Team selected" />;

  const managers = (data?.members ?? []).filter((m) => m.status === 'ACTIVE' && m.manager_role);
  const shareLink = async () => {
    const link = joinLink(team.join_code);
    if (await shareOrCopy(`Join ${team.name} on TeamHub: ${link}`, link)) setCopied(true);
  };
  const onLeave = async () => {
    if (!(await confirm.ask(`Leave ${team.name}?`, 'You will stop receiving attendance requests for this Team.', 'Leave Team', true))) return;
    await leave.run(async () => {
      await api('leaveTeam', { teamId: team.id });
      await teams.reload();
      router.dismissTo('/team');
    });
  };

  return (
    <Screen>
      <ErrorText error={error} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <TeamLogo team={team} size={56} />
        <Text style={[font.title, { flex: 1 }]}>{team.name}</Text>
      </View>
      <Card flush>
        <ListRow first title="Arena" subtitle={team.arena ?? 'Not set'} />
        <ListRow title="Default location" subtitle={team.default_location ?? team.arena ?? 'Not set'} />
        <ListRow title="Time zone" subtitle={team.timezone} />
        <ListRow
          title="Managers"
          subtitle={managers.map((m) => `${m.display_name}${m.manager_role === 'ASSISTANT_MANAGER' ? ' (Assistant)' : ''}`).join(', ') || '—'}
        />
      </Card>
      {manager && (
        <Card>
          <Text style={font.heading}>Invite Players</Text>
          <Text style={font.small}>Share this join link. Every request needs a Manager's approval.</Text>
          <Text selectable style={[font.body, { color: accent.ink }]}>
            {joinLink(team.join_code)}
          </Text>
          <Button label={copied ? 'Link Copied' : 'Share Join Link'} icon={copied ? 'checkmark' : 'share-outline'} onPress={() => void shareLink()} />
        </Card>
      )}
      <Card flush>
        <ListRow first icon="podium-outline" title="Team Statistics" onPress={() => router.push('/stats')} />
      </Card>
      <Button label="Leave Team" variant="danger" busy={leave.busy} onPress={() => void onLeave()} />
      <ErrorText error={leave.error} />
      {confirm.element}
    </Screen>
  );
}
