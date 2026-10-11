import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppStore } from '../src/application/store';
import { AmbientAudio } from '../src/platform/AmbientAudio';
import { AppText, PrimaryButton } from '../src/ui/components';
import { useTheme } from '../src/ui/theme';

function RootContent() {
  const ready = useAppStore((state) => state.ready);
  const error = useAppStore((state) => state.error);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const clearError = useAppStore((state) => state.clearError);
  const updateSession = useAppStore((state) => state.updateSession);
  const { colors, dark } = useTheme();

  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => { const timer = setInterval(() => { if (AppState.currentState === 'active') void useAppStore.getState().syncNow(); },30000); return () => clearInterval(timer); },[]);
  useEffect(() => NetInfo.addEventListener(state => {
    if (state.isConnected && useAppStore.getState().ready) void useAppStore.getState().syncNow();
  }), []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && useAppStore.getState().ready) { void updateSession('reconcile'); void useAppStore.getState().syncNow(); }
    });
    return () => subscription.remove();
  }, [updateSession]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
    <AppText size={22} weight="bold">Concentration</AppText>
    <AppText muted style={{ marginTop: 12, textAlign: 'center' }}>{error ? `本地数据加载失败：${error}` : '正在打开你的专注空间…'}</AppText>
    {error ? <PrimaryButton style={{ marginTop: 24 }} onPress={() => { void bootstrap(); }}>重试</PrimaryButton> : null}
  </View>;

  return <>
    <StatusBar style={dark ? 'light' : 'dark'} />
    <AmbientAudio />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="account" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="task" />
      <Stack.Screen name="state" />
      <Stack.Screen name="recommend" options={{ gestureEnabled: false }} />
      <Stack.Screen name="focus/start" />
      <Stack.Screen name="focus/timer" />
      <Stack.Screen name="feedback" />
      <Stack.Screen name="session/[id]" />
    </Stack>
    {error ? <View style={{ position: 'absolute', bottom: 24, left: 20, right: 20, padding: 16,
      backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.danger }}>
      <AppText>{error}</AppText>
      <PrimaryButton onPress={clearError} style={{ marginTop: 10, minHeight: 44 }}>知道了</PrimaryButton>
    </View> : null}
  </>;
}

export default function RootLayout() {
  return <SafeAreaProvider><RootContent /></SafeAreaProvider>;
}
