import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useAppStore } from '../src/application/store';
import { AVAILABLE_MINUTES } from '../src/domain/recommend';
import type { TaskType } from '../src/domain/focusRecommendation';
import type { Energy, Friction, StateInput } from '../src/domain/types';
import { AppText, Header, Pill, PrimaryButton, Screen, Surface } from '../src/ui/components';

export default function StateSelection() {
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const task = useAppStore((state) => state.tasks.find((item) => item.id === taskId));
  const [taskType,setTaskType] = useState<TaskType>(task ? 'study' : 'general');
  const [energy, setEnergy] = useState<Energy>('medium');
  const [friction, setFriction] = useState<Friction>('low');
  const [availableMinutes, setAvailableMinutes] = useState<StateInput['availableMinutes']>(25);

  return <Screen>
    <Header title="现在感觉如何？" subtitle="只需选三项，我们会据此推荐专注时间。" onBack={() => router.back()} />
    <Surface style={{ marginBottom: 26 }}>
      <AppText size={13} muted>这次要专注</AppText>
      <AppText size={18} weight="medium" style={{ marginTop: 4 }}>{task?.title ?? '自由专注'}</AppText>
    </Surface>
    <AppText size={18} weight="bold">任务类型</AppText>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:12,marginBottom:28}}>
      {([['study','学习'],['reading','阅读'],['writing','写作'],['practice','刷题'],['review','复习'],['general','其他']] as const)
        .map(([value,label]) => <Pill key={value} active={taskType === value} onPress={() => setTaskType(value)}>{label}</Pill>)}
    </View>
    <AppText size={18} weight="bold">当前精力</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12, marginBottom: 28 }}>
      <Pill active={energy === 'low'} onPress={() => setEnergy('low')}>有点累</Pill>
      <Pill active={energy === 'medium'} onPress={() => setEnergy('medium')}>还不错</Pill>
      <Pill active={energy === 'high'} onPress={() => setEnergy('high')}>很充沛</Pill>
    </View>
    <AppText size={18} weight="bold">开始这件事难吗？</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12, marginBottom: 28 }}>
      <Pill active={friction === 'low'} onPress={() => setFriction('low')}>可以直接开始</Pill>
      <Pill active={friction === 'high'} onPress={() => setFriction('high')}>有点难开始</Pill>
    </View>
    <AppText size={18} weight="bold">现在有多少时间？</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
      {AVAILABLE_MINUTES.map((minutes) => <Pill key={minutes} active={availableMinutes === minutes}
        onPress={() => setAvailableMinutes(minutes)}>{minutes} 分钟</Pill>)}
    </View>
    <PrimaryButton icon="arrow-forward" style={{ marginTop: 46 }} onPress={() => router.push({ pathname: '/recommend',
      params: { taskId: taskId ?? '', taskType, energy, friction, availableMinutes: String(availableMinutes) } })}>
      查看专注建议
    </PrimaryButton>
  </Screen>;
}
