import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { selectActiveSession, useAppStore } from '../../src/application/store';
import { calculateStats } from '../../src/domain/stats';
import { AppText, Header, InlineAction, PrimaryButton, Screen, Surface } from '../../src/ui/components';
import { formatMinutes } from '../../src/ui/format';
import { useTheme } from '../../src/ui/theme';

export default function Home() {
  const tasks = useAppStore((state) => state.tasks);
  const sessions = useAppStore((state) => state.sessions);
  const toggleTask = useAppStore((state) => state.toggleTask);
  const active = selectActiveSession(sessions);
  const stats = calculateStats(sessions, Date.now());
  const { colors } = useTheme();
  const open = tasks.filter((task) => task.deletedAt === null && task.status === 'open');
  const completed = tasks.filter((task) => task.deletedAt === null && task.status === 'completed');

  return <Screen>
    <Header title="今天，专心一件事" subtitle="不用准备得很完美，从现在开始就好。" />
    {active ? <Surface style={{ backgroundColor: colors.accentSoft, marginBottom: 18 }}>
      <AppText size={20} weight="bold">正在进行的专注</AppText>
      <AppText muted style={{ marginTop: 6 }}>你的进度已经保存在本机</AppText>
      <PrimaryButton style={{ marginTop: 18 }} onPress={() => router.push(active.phase === 'start_mode' ? '/focus/start' : '/focus/timer')}>
        返回专注
      </PrimaryButton>
    </Surface> : <Surface style={{ marginBottom: 18, paddingVertical: 28 }}>
      <AppText size={14} muted>今天已完成的专注</AppText>
      <AppText size={42} weight="bold" style={{ marginTop: 8, letterSpacing: -1 }}>{formatMinutes(stats.todayMs)}</AppText>
      <AppText size={14} muted style={{ marginTop: 5 }}>每一段时间都来自你的真实记录</AppText>
      <PrimaryButton style={{ marginTop: 24 }} icon="play" onPress={() => router.push('/state')}>
        开始一次专注
      </PrimaryButton>
    </Surface>}

    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 12 }}>
      <AppText size={22} weight="bold">待做的事</AppText>
      <InlineAction onPress={() => router.push('/task')} icon="add">添加任务</InlineAction>
    </View>
    {open.length === 0 ? <Surface style={{ alignItems: 'center', paddingVertical: 30 }}>
      <Ionicons name="leaf-outline" size={30} color={colors.accent} />
      <AppText weight="medium" style={{ marginTop: 12 }}>还没有待做任务</AppText>
      <AppText size={14} muted style={{ marginTop: 4, textAlign: 'center' }}>可以先自由专注，也可以写下眼前这件事。</AppText>
    </Surface> : open.map((task) => <Surface key={task.id} style={{ marginBottom: 10, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`完成 ${task.title}`} onPress={() => { void toggleTask(task.id); }}
          style={{ width: 30, height: 30, borderWidth: 2, borderColor: colors.accent, borderRadius: 15 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={`专注 ${task.title}`} style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/state', params: { taskId: task.id } })}>
          <AppText weight="medium" numberOfLines={2}>{task.title}</AppText>
          {task.estimatedMinutes ? <AppText size={13} muted>{task.estimatedMinutes} 分钟预估</AppText> : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`编辑 ${task.title}`} onPress={() => router.push({ pathname: '/task', params: { id: task.id } })}>
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.muted} />
        </Pressable>
      </View>
    </Surface>)}
    {completed.length > 0 ? <View style={{ marginTop: 18, marginBottom: 20 }}>
      <AppText size={16} weight="medium" muted>已完成 · {completed.length}</AppText>
      {completed.map((task) => <View key={task.id} style={{ paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`重新打开 ${task.title}`} onPress={() => { void toggleTask(task.id); }}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
          <AppText muted style={{ textDecorationLine: 'line-through', flex: 1 }}>{task.title}</AppText>
          <AppText size={12} muted>重新打开</AppText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`编辑 ${task.title}`}
          onPress={() => router.push({ pathname: '/task', params: { id: task.id } })}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.muted} />
        </Pressable>
      </View>)}
    </View> : null}
  </Screen>;
}
