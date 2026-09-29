import { useRouter } from 'expo-router';
import { DefaultRosterEditor } from '../../features/settings/DefaultRosterSettings';
import { useSelectedTeam } from '../../features/team/useSelectedTeam';
import { Empty, Loading, Screen } from '../../ui/components';

/** Wireframes 2B and 2C, opened from the Team tab's Default Roster. */
export default function EditDefaultRoster() {
  const router = useRouter();
  const { membership, manager, data, loading, error, teams } = useSelectedTeam();

  if (loading && !data) return <Loading />;
  if (!membership || !data) return <Empty title="No Team selected" body={error ?? undefined} />;
  if (!manager) return <Empty title="Only Managers can edit the default roster" />;

  return (
    <Screen>
      <DefaultRosterEditor
        membership={membership}
        detail={data}
        onSaved={async () => {
          await teams.reload();
          router.back();
        }}
      />
    </Screen>
  );
}
