import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useAppStore } from '../src/application/store';
import { totalFocusMs } from '../src/domain/session';
import { AppText, Header, Pill, PrimaryButton, QuietButton, Screen, Surface } from '../src/ui/components';
import { formatMinutes } from '../src/ui/format';
import { useTheme } from '../src/ui/theme';

export default function Feedback() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const session = useAppStore((state) => state.sessions.find((item) => item.id === sessionId));
  const existing = useAppStore((state) => state.feedback.find((item) => item.sessionId === sessionId));
  const submitFeedback = useAppStore((state) => state.submitFeedback);
  const { colors } = useTheme();
  const [focus, setFocus] = useState<number | null>(existing?.perceivedFocus ?? null);
  const [interruptions, setInterruptions] = useState<0 | 1 | 2 | null>(existing?.interruptionCount ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const hasFeedback = focus !== null || interruptions !== null || note.trim().length > 0;
  const save = async () => {
    if (!session) return;
    setBusy(true);
    try { await submitFeedback(session.id, focus, interruptions, note); router.replace('/(tabs)/growth'); }
    catch { /* store displays the error */ }
    finally { setBusy(false); }
  };
  if (!session || session.status !== 'finished') return <Screen><Header title="暂无可填写的反馈" onBack={() => router.replace('/(tabs)')} /></Screen>;

  return <Screen>
    <Header title="这一段，属于你。" subtitle="简单回顾一下，让下一次开始更轻松。" onBack={() => router.replace('/(tabs)')} />
    <Surface style={{ marginBottom: 30 }}>
      <AppText size={14} muted>本次实际专注</AppText>
      <AppText size={40} weight="bold" style={{ marginTop: 4 }}>{formatMinutes(totalFocusMs(session))}</AppText>
      <AppText size={14} muted style={{ marginTop: 5 }}>
        {session.endReason === 'goal_reached' ? '已达到计划时长' : '按实际投入时间记录'}
      </AppText>
    </Surface>
    <AppText size={18} weight="bold">刚才有多专注？</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12, marginBottom: 28 }}>
      {[1, 2, 3, 4, 5].map((value) => <Pill key={value} active={focus === value} onPress={() => setFocus(value)}>{value}</Pill>)}
    </View>
    <AppText size={18} weight="bold">被打断了几次？</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12, marginBottom: 28 }}>
      <Pill active={interruptions === 0} onPress={() => setInterruptions(0)}>没有</Pill>
      <Pill active={interruptions === 1} onPress={() => setInterruptions(1)}>1 次</Pill>
      <Pill active={interruptions === 2} onPress={() => setInterruptions(2)}>2 次以上</Pill>
    </View>
    <Surface>
      <AppText size={14} weight="medium">留一句话给自己（可选）</AppText>
      <TextInput value={note} onChangeText={setNote} maxLength={500} multiline
        placeholder="刚才什么帮助了你？" placeholderTextColor={colors.muted}
        style={{ color: colors.ink, fontSize: 15, minHeight: 85, textAlignVertical: 'top', paddingTop: 12 }} />
    </Surface>
    <PrimaryButton loading={busy} disabled={!hasFeedback} onPress={() => { void save(); }} style={{ marginTop: 32 }}>保存回顾</PrimaryButton>
    <QuietButton onPress={() => router.replace('/(tabs)/growth')} style={{ marginTop: 10 }}>暂时跳过</QuietButton>
  </Screen>;
}
