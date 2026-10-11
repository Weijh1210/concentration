import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useAppStore } from '../../src/application/store';
import { totalFocusMs } from '../../src/domain/session';
import { calculateStats } from '../../src/domain/stats';
import { AppText, Header, Screen, Surface } from '../../src/ui/components';
import { formatDate, formatMinutes } from '../../src/ui/format';
import { useTheme } from '../../src/ui/theme';

export default function Growth() {
  const sessions = useAppStore((state) => state.sessions);
  const tasks = useAppStore((state) => state.tasks);
  const stats = calculateStats(sessions, Date.now());
  const history = sessions.filter((session) => session.status === 'finished' || session.status === 'abandoned');
  const { colors } = useTheme();
  const max = Math.max(...stats.lastSevenDays.map((item) => item.focusMs), 60_000);

  return <Screen>
    <Header title="每一次，都算数" subtitle="这里的数字只来自你的真实专注记录。" />
    <Surface>
      <AppText size={14} muted>近 7 天专注</AppText>
      <AppText size={42} weight="bold" style={{ marginTop: 5 }}>{formatMinutes(stats.weekMs)}</AppText>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 24, alignItems: 'flex-end', height: 110 }}>
        {stats.lastSevenDays.map((item) => {
          const height = Math.max(5, Math.round((item.focusMs / max) * 88));
          return <View key={item.date} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
            <View style={{ width: '100%', height, borderRadius: 8, backgroundColor: item.focusMs > 0 ? colors.accent : colors.surfaceAlt }} />
            <AppText size={11} muted style={{ marginTop: 7 }}>{Number(item.date.slice(-2))}日</AppText>
          </View>;
        })}
      </View>
    </Surface>
    <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
      <Surface style={{ flex: 1, padding: 18 }}>
        <AppText size={28} weight="bold">{stats.completedCount}</AppText>
        <AppText size={13} muted>完成的会话</AppText>
      </Surface>
      <Surface style={{ flex: 1, padding: 18 }}>
        <AppText size={28} weight="bold">{stats.streakDays}</AppText>
        <AppText size={13} muted>连续专注天数</AppText>
      </Surface>
    </View>
    <AppText size={22} weight="bold" style={{ marginTop: 34, marginBottom: 14 }}>专注记录</AppText>
    {history.length === 0 ? <Surface style={{ paddingVertical: 28 }}>
      <AppText weight="medium">从一次专注开始</AppText>
      <AppText size={14} muted style={{ marginTop: 5 }}>结束会话后，记录会出现在这里。</AppText>
    </Surface> : history.map((session) => {
      const task = tasks.find((item) => item.id === session.taskId);
      return <Pressable key={session.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })}>
        <Surface style={{ marginBottom: 10, padding: 18 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <AppText weight="medium" style={{ flex: 1 }} numberOfLines={1}>{task?.title ?? '自由专注'}</AppText>
            <AppText size={14} weight="medium">{formatMinutes(totalFocusMs(session))}</AppText>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <AppText size={13} muted>{formatDate(session.startedAt)}</AppText>
            <AppText size={13} muted>{session.status === 'abandoned' ? '未形成有效专注' : session.endReason === 'goal_reached' ? '达到计划' : '提前结束'}</AppText>
          </View>
        </Surface>
      </Pressable>;
    })}
    <AppText size={12} muted style={{ marginTop: 12, marginBottom: 10 }}>
      统计仅计算已结束且有实际专注时长的会话；跨午夜会话归开始日。
    </AppText>
  </Screen>;
}
