import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useAppStore } from '../../src/application/store';
import { AppText, Header, Pill, QuietButton, Screen, Surface } from '../../src/ui/components';
import { confirmAction } from '../../src/ui/confirm';

export default function Profile() {
  const [actionError,setActionError] = useState<string | null>(null);
  const run = (work: Promise<unknown>) => { void work.catch(error => setActionError(error instanceof Error ? error.message : '操作失败')); };
  const preference = useAppStore((state) => state.themePreference);
  const setPreference = useAppStore((state) => state.setThemePreference);
  const soundEnabled = useAppStore((state) => state.soundEnabled);
  const volume = useAppStore((state) => state.soundVolume);
  const setSoundEnabled = useAppStore((state) => state.setSoundEnabled);
  const setSoundVolume = useAppStore((state) => state.setSoundVolume);
  const clearAllData = useAppStore((state) => state.clearAllData);
  const authUser = useAppStore((state) => state.authUser);
  const configured = useAppStore((state) => state.cloudConfigured);
  const syncState = useAppStore((state) => state.syncState);
  const pending = useAppStore((state) => state.pendingCount);
  const conflicts = useAppStore((state) => state.conflictCount);
  const syncNow = useAppStore((state) => state.syncNow);
  const signOut = useAppStore((state) => state.signOut);
  const importGuestData = useAppStore((state) => state.importGuestData);
  const deleteAccount = useAppStore((state) => state.deleteAccount);
  const resolveConflicts = useAppStore((state) => state.resolveConflicts);

  return <Screen>
    <Header title="我的专注空间" subtitle="调整适合自己的节奏。" />
    <Surface>
      <AppText size={18} weight="bold">外观</AppText>
      <AppText size={14} muted style={{ marginTop: 4 }}>选择你更自在的背景</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 18 }}>
        <Pill active={preference === 'system'} onPress={() => { void setPreference('system'); }}>跟随系统</Pill>
        <Pill active={preference === 'light'} onPress={() => { void setPreference('light'); }}>浅色</Pill>
        <Pill active={preference === 'dark'} onPress={() => { void setPreference('dark'); }}>深色</Pill>
      </View>
    </Surface>
    <Surface style={{ marginTop: 12 }}>
      <AppText size={18} weight="bold">白噪音</AppText>
      <AppText size={14} muted style={{ marginTop: 4 }}>默认关闭，只在专注计时时播放</AppText>
      <View style={{ flexDirection: 'row', gap: 9, marginTop: 18 }}>
        <Pill active={!soundEnabled} onPress={() => { void setSoundEnabled(false); }}>关闭</Pill>
        <Pill active={soundEnabled} onPress={() => { void setSoundEnabled(true); }}>开启</Pill>
      </View>
      <AppText size={14} weight="medium" style={{ marginTop: 20, marginBottom: 10 }}>音量</AppText>
      <View style={{ flexDirection: 'row', gap: 9 }}>
        <Pill active={volume === 0.25} onPress={() => { void setSoundVolume(0.25); }}>轻</Pill>
        <Pill active={volume === 0.5} onPress={() => { void setSoundVolume(0.5); }}>中</Pill>
        <Pill active={volume === 0.8} onPress={() => { void setSoundVolume(0.8); }}>强</Pill>
      </View>
    </Surface>
    <Surface style={{ marginTop: 12 }}>
      <AppText size={18} weight="bold">账号与同步</AppText>
      {authUser ? <>
        <AppText muted style={{marginTop:8}}>{authUser.email ?? authUser.id}</AppText>
        <AppText size={14} muted style={{marginTop:8}}>
          {syncState === 'syncing' ? '正在同步' : syncState === 'idle' ? '已同步' : syncState === 'conflict' ? '存在同步冲突' : '离线或同步失败'}
          {pending || conflicts ? ` · 待同步 ${pending} · 冲突 ${conflicts}` : ''}
        </AppText>
        {conflicts ? <View style={{marginTop:14,gap:8}}>
          <AppText size={13} muted>冲突记录保留在本机。选择版本后再继续同步。</AppText>
          <QuietButton onPress={() => { run(resolveConflicts('local')); }}>保留本机版本</QuietButton>
          <QuietButton onPress={() => confirmAction('使用云端版本？','冲突的本机改动将被丢弃。','使用云端',() => { run(resolveConflicts('cloud')); })}>使用云端版本</QuietButton>
        </View> : null}
        <QuietButton icon="sync" style={{marginTop:16}} onPress={() => { void syncNow(); }}>立即同步</QuietButton>
        <QuietButton icon="cloud-upload-outline" style={{marginTop:10}} onPress={() => {
          confirmAction('导入游客记录？','本机游客任务和历史将加入当前账号。请确保已结束游客专注。','导入',() => { run(importGuestData()); });
        }}>导入本机游客记录</QuietButton>
        <QuietButton icon="log-out-outline" style={{marginTop:10}} onPress={() => { run(signOut()); }}>退出登录</QuietButton>
        <QuietButton danger icon="trash-outline" style={{marginTop:10}} onPress={() => {
          confirmAction('永久删除账号？','云端账号与记录、此账号的本机缓存都将删除，无法恢复。','删除账号',() => { run(deleteAccount().then(() => router.replace('/welcome'))); });
        }}>删除账号及数据</QuietButton>
      </> : <>
        <AppText size={14} muted style={{marginTop:8}}>当前为本机游客体验。登录后可同步账号记录，游客记录需手动导入。</AppText>
        <QuietButton icon="person-outline" style={{marginTop:16}} onPress={() => router.push('/account')}>
          {configured ? '注册或登录' : '查看账号配置'}
        </QuietButton>
        <QuietButton danger icon="trash-outline" style={{marginTop:10}}
          onPress={() => confirmAction('清除游客数据？','本机游客记录将永久删除，无法恢复。','清除',() => {
            void clearAllData().then(() => router.replace('/welcome'));
          })}>清除游客数据</QuietButton>
      </>}
    </Surface>
    {actionError ? <AppText size={14} style={{marginTop:12}}>{actionError}</AppText> : null}
    <AppText size={13} muted style={{ marginTop: 26, textAlign: 'center' }}>Concentration · 本地优先 MVP</AppText>
  </Screen>;
}
