import { Stack, useLocalSearchParams } from 'expo-router';
import { AttendanceSettings } from '../../../features/settings/AttendanceSettings';
import { BrandingSettings } from '../../../features/settings/BrandingSettings';
import { CallupSettings } from '../../../features/settings/CallupSettings';
import { DefaultRosterSettings } from '../../../features/settings/DefaultRosterSettings';
import { GeneralSettings } from '../../../features/settings/GeneralSettings';
import { MemberSettings } from '../../../features/settings/MemberSettings';
import { PositionSettings } from '../../../features/settings/PositionSettings';
import { SETTINGS_SECTIONS, type SectionKey } from '../../../features/settings/sections';
import { loadTeamDetail } from '../../../lib/data';
import { useLoader } from '../../../lib/hooks';
import { isManagerOf, useTeams } from '../../../lib/teams';
import { Empty, ErrorText, Loading, Screen } from '../../../ui/components';
import { TeamAccent } from '../../../ui/TeamAccent';

const SECTIONS = {
  general: GeneralSettings,
  branding: BrandingSettings,
  attendance: AttendanceSettings,
  roster: DefaultRosterSettings,
  positions: PositionSettings,
  callups: CallupSettings,
  members: MemberSettings,
} satisfies Record<SectionKey, unknown>;

export default function SettingsSection() {
  const { teamId, section } = useLocalSearchParams<{ teamId: string; section: SectionKey }>();
  const teams = useTeams();
  const membership = teams.active.find((m) => m.team.id === teamId);
  const { data, error, loading, reload } = useLoader(async () => (membership ? loadTeamDetail(membership.team, true) : null), [teamId, !!membership]);
  const meta = SETTINGS_SECTIONS.find((s) => s.key === section);
  const Section = SECTIONS[section];

  if (teams.loading) return <Loading />;
  if (!membership || !isManagerOf(membership) || !meta || !Section) return <Empty title="Team Settings are for Managers" />;
  if (loading && !data) return <Loading />;
  if (!data) return <Empty title="Could not load settings" body={error ?? undefined} />;

  const refresh = async () => {
    await Promise.all([reload(), teams.reload()]);
  };
  return (
    <TeamAccent color={membership.team.accent_color}>
      <Screen onRefresh={refresh}>
        <Stack.Screen options={{ title: meta.title }} />
        <ErrorText error={error} />
        <Section membership={membership} detail={data} reload={refresh} />
      </Screen>
    </TeamAccent>
  );
}
