import { router } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';
import { selectActiveSession, useAppStore } from '../../src/application/store';
import { isStartComplete, phaseElapsedMs, START_MODE_MS } from '../../src/domain/session';
import { useFocusClock } from '../../src/features/focus/useFocusClock';
import { AppText, FocusOrb, PrimaryButton, QuietButton, Screen } from '../../src/ui/components';
import { formatTimer } from '../../src/ui/format';
import { confirmAction } from '../../src/ui/confirm';

export default function StartMode() {
  const sessions = useAppStore((state) => state.sessions);
  const tasks = useAppStore((state) => state.tasks);
  const updateSession = useAppStore((state) => state.updateSession);
  const now = useFocusClock();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const session = selectActiveSession(sessions);
  if (!session || session.phase !== 'start_mode') return <Screen scroll={false} style={{ justifyContent: 'center' }}>
    <AppText>当前没有启动中的专注。</AppText>
    <PrimaryButton onPress={() => router.replace('/(tabs)')} style={{ marginTop: 20 }}>返回今天</PrimaryButton>
  </Screen>;

  const task = tasks.find((item) => item.id === session.taskId);
  const elapsed = phaseElapsedMs(session, now);
  const complete = isStartComplete(session, now);
  const paused = session.status === 'paused';
  const finish = () => confirmAction('结束这次专注？', '已经投入的时间会如实记录。', '结束', () => {
    void updateSession('finish', 'user_ended').then((done) => {
      router.replace(done?.status === 'finished' ? { pathname: '/feedback', params: { sessionId: done.id } } : '/(tabs)');
    });
  });

  return <Screen scroll={compact} style={{ justifyContent: 'space-between' }}>
    <View style={{ paddingTop: 12, alignItems: 'center' }}>
      <AppText size={15} weight="medium">5 分钟启动</AppText>
      <AppText size={14} muted style={{ marginTop: 8, textAlign: 'center' }}>{task?.title ?? '自由专注'}</AppText>
    </View>
    <View style={{ alignItems: 'center' }}>
      <FocusOrb main={formatTimer(START_MODE_MS - elapsed)} caption={complete ? '你已经开始了' : '只做眼前的一小步'}
        size={compact ? 208 : 260} progress={elapsed / START_MODE_MS} />
      <AppText size={23} weight="medium" style={{ marginTop: compact ? 16 : 34, textAlign: 'center' }}>
        {complete ? '已经迈出第一步。' : paused ? '休息一下，准备好再继续。' : '先做五分钟，就够了。'}
      </AppText>
      <AppText muted style={{ marginTop: 8, textAlign: 'center' }}>
        {complete ? '可以继续正式专注，也可以把这段时间记录下来。' : '不用想着全部完成，只要保持在这件事上。'}
      </AppText>
      {session.clockWarning ? <AppText size={13} style={{ marginTop: 12, textAlign: 'center' }}>检测到系统时间变化，计时已暂停。请核对时间。</AppText> : null}
    </View>
    <View style={{ gap: 12 }}>
      {complete ? <PrimaryButton icon="arrow-forward" onPress={() => { void updateSession('continueStart').then(() => router.replace('/focus/timer')); }}>
        继续正式专注
      </PrimaryButton> : <PrimaryButton icon={paused ? 'play' : 'pause'} onPress={() => { void updateSession(paused ? 'resume' : 'pause'); }}>
        {paused ? '继续启动' : '暂停'}
      </PrimaryButton>}
      {!complete ? <QuietButton onPress={() => { void updateSession('continueStart').then(() => router.replace('/focus/timer')); }}>
        直接进入正式专注
      </QuietButton> : null}
      <QuietButton onPress={finish}>结束并记录</QuietButton>
    </View>
  </Screen>;
}
