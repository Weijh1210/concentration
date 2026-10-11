import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTheme } from '../../src/ui/theme';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline', growth: 'bar-chart-outline', together: 'people-outline', profile: 'person-outline',
};

export default function TabsLayout() {
  const { colors } = useTheme();
  return <Tabs screenOptions={({ route }) => ({
    headerShown: false,
    tabBarActiveTintColor: colors.accent,
    tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: 62, paddingTop: 6 },
    tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
    tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name] ?? 'ellipse-outline'} color={color} size={size} />,
  })}>
    <Tabs.Screen name="index" options={{ title: '今天' }} />
    <Tabs.Screen name="growth" options={{ title: '成长' }} />
    <Tabs.Screen name="together" options={{ title: '一起' }} />
    <Tabs.Screen name="profile" options={{ title: '我的' }} />
  </Tabs>;
}
