import { router } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useAppStore } from '../src/application/store';
import { AppText, FocusOrb, PrimaryButton, Screen, Title } from '../src/ui/components';

export default function Welcome() {
  const completeWelcome = useAppStore((state) => state.completeWelcome);
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const [saving, setSaving] = useState(false);
  const begin = async () => {
    setSaving(true);
    try { await completeWelcome(); router.replace('/(tabs)'); }
    catch { /* store displays the error */ }
    finally { setSaving(false); }
  };
  return <Screen scroll={compact} style={{ justifyContent: 'space-between' }}>
    <View style={{ paddingTop: 12 }}>
      <AppText size={18} weight="bold">Concentration</AppText>
      <AppText muted style={{ marginTop: 4 }}>给眼前这件事一点完整的时间</AppText>
    </View>
    <View style={{ alignItems: 'center' }}>
      <FocusOrb main="现在" caption="就是一个很好的开始" size={compact ? 206 : 252} />
      <View style={{ marginTop: compact ? 18 : 36, alignSelf: 'stretch' }}>
        <Title size={38}>先开始，再进入状态。</Title>
        <AppText muted style={{ marginTop: 16, maxWidth: 320 }}>
          写下要做的事，选一选现在的状态。我们会为你安排一段刚刚好的专注时间。
        </AppText>
      </View>
    </View>
    <View style={{ gap: 14 }}>
      <PrimaryButton icon="arrow-forward" loading={saving} onPress={() => { void begin(); }}>
        开始使用
      </PrimaryButton>
      <AppText size={13} muted style={{ textAlign: 'center' }}>目前为本机游客体验，数据只保存在这台设备</AppText>
    </View>
  </Screen>;
}
