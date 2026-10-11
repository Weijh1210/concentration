import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';
import { selectActiveSession, useAppStore } from '../../src/application/store';
import { phaseElapsedMs } from '../../src/domain/session';
import { useFocusClock } from '../../src/features/focus/useFocusClock';
import { AppText, FocusOrb, PrimaryButton, QuietButton, Screen } from '../../src/ui/components';
import { formatTimer } from '../../src/ui/format';
import { useTheme } from '../../src/ui/theme';
import { confirmAction } from '../../src/ui/confirm';

export default function FocusTimer() {
  const sessions = useAppStore((state) => state.sessions);
  const tasks = useAppStore((state) => state.tasks);
  const updateSession = useAppStore((state) => state.updateSession);
  const soundEnabled = useAppStore((state) => state.soundEnabled);
  const setSoundEnabled = useAppStore((state) => state.setSoundEnabled);
  const { colors } = useTheme();
  const now = useFocusClock();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const session = selectActiveSession(sessions);
  if (!session || session.phase !== 'focus') return <Screen scroll={false} style={{ justifyContent: 'center' }}>
    <AppText>当前没有进行中的专注。</AppText>
    <PrimaryButton onPress={() => router.replace('/(tabs)')} style={{ marginTop: 20 }}>返回今天</PrimaryButton>
  </Screen>;

  const task = tasks.find((item) => item.id === session.taskId);
  const elapsed = phaseElapsedMs(session, now);
  const due = session.status === 'awaiting_finish';
  const paused = session.status === 'paused';
  const remaining = Math.max(0, session.plannedDurationMs - elapsed);
  const finish = (reason: 'goal_reached' | 'user_ended') => {
    const perform = () => { void updateSession('finish', reason).then((done) => {
      if (done) router.replace({ pathname: '/feedback', params: { sessionId: done.id } });
    }); };
    if (reason === 'user_ended') confirmAction('提前结束专注？', '实际投入的时间会如实记录。', '结束并记录', perform);
    else perform();
  };

  return <Screen scroll={compact} style={{ justifyContent: 'space-between' }}>
    <View style={{ paddingTop: 12, alignItems: 'center' }}>
      <AppText size={15} weight="medium">专注中</AppText>
      <AppText size={14} muted style={{ marginTop: 8, textAlign: 'center' }}>{task?.title ?? '自由专注'}</AppText>
    </View>
    <View style={{ alignItems: 'center' }}>
      <FocusOrb main={formatTimer(session.extended ? elapsed : remaining)}
        caption={session.extended ? '已专注' : '剩余时间'} size={compact ? 208 : 260}
        progress={elapsed / session.plannedDurationMs} />
      <AppText size={23} weight="medium" style={{ marginTop: compact ? 16 : 34, textAlign: 'center' }}>
        {due ? '这一段，完成了。' : paused ? '慢慢来，随时可以继续。' : '此刻，只做这一件事。'}
      </AppText>
      <AppText muted style={{ marginTop: 8, textAlign: 'center' }}>
        {due ? '想再多专注一会儿，还是记录这次完成？' : `计划 ${Math.round(session.plannedDurationMs / 60_000)} 分钟`}
      </AppText>
      {session.clockWarning ? <AppText size={13} style={{ marginTop: 12, textAlign: 'center' }}>检测到系统时间变化，计时已暂停。请核对时间。</AppText> : null}
      <QuietButton style={{ marginTop: 22 }} icon={soundEnabled ? 'volume-medium-outline' : 'volume-mute-outline'}
        onPress={() => { void setSoundEnabled(!soundEnabled); }}>
        {soundEnabled ? '关闭白噪音' : '播放白噪音'}
      </QuietButton>
    </View>
    <View style={{ gap: 12 }}>
      {due ? <>
        <PrimaryButton icon="checkmark" onPress={() => finish('goal_reached')}>完成并记录</PrimaryButton>
        <QuietButton onPress={() => { void updateSession('continueGoal'); }}>再专注一会儿</QuietButton>
      </> : <>
        <PrimaryButton icon={paused ? 'play' : 'pause'} onPress={() => { void updateSession(paused ? 'resume' : 'pause'); }}>
          {paused ? '继续专注' : '暂停'}
        </PrimaryButton>
        <QuietButton onPress={() => finish('user_ended')}>提前结束</QuietButton>
      </>}
      <View style={{ alignItems: 'center', paddingTop: 3 }}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.muted} />
        <AppText size={12} muted>计时与记录只保存在本机</AppText>
      </View>
    </View>
  </Screen>;
}
