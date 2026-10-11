import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { AppText, Header, Screen, Surface } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function Together() {
  const { colors } = useTheme();
  return <Screen>
    <Header title="一起，也能安静专注" subtitle="Together 正在规划中。" />
    <Surface style={{ marginTop: 26, minHeight: 290, justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: colors.accentSoft,
        justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
        <Ionicons name="people-outline" size={42} color={colors.accent} />
      </View>
      <AppText size={22} weight="bold">未来，和同伴并肩</AppText>
      <AppText muted style={{ marginTop: 12, textAlign: 'center', maxWidth: 260 }}>
        我们计划加入好友同步专注和静默自习室。当前版本尚未开放，也不会展示模拟用户。
      </AppText>
    </Surface>
    <AppText size={14} muted style={{ marginTop: 22, textAlign: 'center' }}>现在可以先从「今天」开始自己的专注。</AppText>
  </Screen>;
}
