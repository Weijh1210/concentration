import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useAppStore } from '../../src/application/store';
import { totalFocusMs } from '../../src/domain/session';
import { AppText, Header, PrimaryButton, Screen, Surface } from '../../src/ui/components';
import { formatDate, formatMinutes } from '../../src/ui/format';

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useAppStore((state) => state.sessions.find((item) => item.id === id));
  const task = useAppStore((state) => state.tasks.find((item) => item.id === session?.taskId));
  const feedback = useAppStore((state) => state.feedback.find((item) => item.sessionId === id));
  if (!session) return <Screen><Header title="记录不存在" onBack={() => router.back()} /></Screen>;
  return <Screen>
    <Header title="专注记录" subtitle={formatDate(session.startedAt)} onBack={() => router.back()} />
    <Surface>
      <AppText size={14} muted>{task?.title ?? '自由专注'}</AppText>
      <AppText size={40} weight="bold" style={{ marginTop: 8 }}>{formatMinutes(totalFocusMs(session))}</AppText>
      <AppText size={14} muted style={{ marginTop: 4 }}>
        {session.status === 'abandoned' ? '未形成有效专注' : session.endReason === 'goal_reached' ? '达到计划时长' : '提前结束'}
      </AppText>
    </Surface>
    <Surface style={{ marginTop: 12 }}>
      <AppText size={18} weight="bold">本次回顾</AppText>
      {feedback ? <View style={{ gap: 8, marginTop: 14 }}>
        {feedback.perceivedFocus !== null ? <AppText>专注感受：{feedback.perceivedFocus} / 5</AppText> : null}
        {feedback.interruptionCount !== null ? <AppText>被打断：{feedback.interruptionCount === 2 ? '2 次以上' : `${feedback.interruptionCount} 次`}</AppText> : null}
        {feedback.note ? <AppText muted>{feedback.note}</AppText> : null}
      </View> : <AppText muted style={{ marginTop: 10 }}>还没有填写回顾。</AppText>}
    </Surface>
    {session.status === 'finished' ? <PrimaryButton style={{ marginTop: 24 }} onPress={() => router.push({ pathname: '/feedback', params: { sessionId: session.id } })}>
      {feedback ? '编辑回顾' : '补写回顾'}
    </PrimaryButton> : null}
  </Screen>;
}
