import { Redirect } from 'expo-router';
import { selectActiveSession, useAppStore } from '../src/application/store';

export default function Index() {
  const ready = useAppStore((state) => state.ready);
  const welcomeSeen = useAppStore((state) => state.welcomeSeen);
  const sessions = useAppStore((state) => state.sessions);
  if (!ready) return null;
  if (!welcomeSeen) return <Redirect href="/welcome" />;
  const active = selectActiveSession(sessions);
  if (active) return <Redirect href={active.phase === 'start_mode' ? '/focus/start' : '/focus/timer'} />;
  return <Redirect href="/(tabs)" />;
}
