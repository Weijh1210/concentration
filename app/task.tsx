import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { useAppStore } from '../src/application/store';
import { AppText, Header, Pill, PrimaryButton, QuietButton, Screen, Surface } from '../src/ui/components';
import { useTheme } from '../src/ui/theme';
import { confirmAction } from '../src/ui/confirm';

const estimates = [15, 25, 45, 60] as const;

export default function TaskEditor() {
  const params = useLocalSearchParams<{ id?: string }>();
  const task = useAppStore((state) => state.tasks.find((item) => item.id === params.id));
  const createTask = useAppStore((state) => state.createTask);
  const editTask = useAppStore((state) => state.editTask);
  const deleteTask = useAppStore((state) => state.deleteTask);
  const { colors } = useTheme();
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [estimate, setEstimate] = useState<number | null>(task?.estimatedMinutes ?? null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { Alert.alert('请输入任务名称'); return; }
    setSaving(true);
    try {
      if (task) await editTask(task.id, title, notes, estimate);
      else await createTask(title, notes, estimate);
      router.back();
    } catch { /* store displays the error */ }
    finally { setSaving(false); }
  };

  return <Screen>
    <Header title={task ? '编辑任务' : '写下眼前这件事'} subtitle="一个清楚的小目标，会让开始更容易。" onBack={() => router.back()} />
    <Surface>
      <AppText size={14} weight="medium">任务名称</AppText>
      <TextInput value={title} onChangeText={setTitle} maxLength={200} placeholder="例如：复习英语阅读第一章"
        placeholderTextColor={colors.muted} style={{ color: colors.ink, fontSize: 18, paddingVertical: 12, marginTop: 4 }} />
      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 12 }} />
      <AppText size={14} weight="medium">备注（可选）</AppText>
      <TextInput value={notes} onChangeText={setNotes} maxLength={2000} multiline placeholder="写下第一步，或给自己一点提示"
        placeholderTextColor={colors.muted} style={{ color: colors.ink, fontSize: 15, minHeight: 90, textAlignVertical: 'top', paddingTop: 10 }} />
    </Surface>
    <AppText weight="medium" style={{ marginTop: 28, marginBottom: 12 }}>预计需要多久？</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <Pill active={estimate === null} onPress={() => setEstimate(null)}>暂不确定</Pill>
      {estimates.map((value) => <Pill key={value} active={estimate === value} onPress={() => setEstimate(value)}>{value} 分钟</Pill>)}
    </View>
    <PrimaryButton loading={saving} onPress={() => { void save(); }} style={{ marginTop: 40 }}>
      {task ? '保存修改' : '创建任务'}
    </PrimaryButton>
    {task ? <QuietButton danger icon="trash-outline" style={{ marginTop: 12 }}
      onPress={() => confirmAction('删除任务？', '历史专注记录会保留。', '删除', () => {
        void deleteTask(task.id).then(() => router.back());
      })}>删除任务</QuietButton> : null}
  </Screen>;
}
