import { useLocalSearchParams } from 'expo-router';
import { JoinTeam } from '../../features/JoinTeam';

/** Opened by the shared join link …/join/<code>. */
export default function JoinLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <JoinTeam initialCode={code ?? ''} />;
}
