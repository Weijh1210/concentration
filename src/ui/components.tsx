import type { ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from './theme';

export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const contentStyle: StyleProp<ViewStyle> = [{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, paddingHorizontal: 24, flexGrow: 1 }, style];
  return <LinearGradient colors={[colors.background, colors.backgroundEnd]} style={styles.fill}>
    {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={contentStyle} showsVerticalScrollIndicator={false}>{children}</ScrollView>
      : <View style={[styles.fill, contentStyle]}>{children}</View>}
  </LinearGradient>;
}

export function AppText({ children, size = 16, weight = 'regular', muted = false, style, numberOfLines }:
  { children: ReactNode; size?: number; weight?: 'regular' | 'medium' | 'bold'; muted?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const { colors } = useTheme();
  return <Text numberOfLines={numberOfLines} style={[{
    color: muted ? colors.muted : colors.ink, fontSize: size,
    fontWeight: weight === 'bold' ? '700' : weight === 'medium' ? '600' : '400',
    lineHeight: Math.round(size * 1.4),
  }, style]}>{children}</Text>;
}

export function Title({ children, size = 34 }: { children: ReactNode; size?: number }) {
  return <AppText size={size} weight="bold" style={{ letterSpacing: -0.7, lineHeight: size * 1.24 }}>{children}</AppText>;
}

export function PrimaryButton({ children, onPress, disabled = false, loading = false, style, icon }:
  { children: ReactNode; onPress: () => void; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; icon?: keyof typeof Ionicons.glyphMap }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => [styles.primary, { backgroundColor: colors.accent, opacity: disabled ? 0.5 : pressed ? 0.82 : 1 }, style]}>
    {loading ? <ActivityIndicator color={colors.lightText} /> : <>
      {icon ? <Ionicons name={icon} size={20} color={colors.lightText} /> : null}
      <Text style={{ color: colors.lightText, fontSize: 17, fontWeight: '700' }}>{children}</Text>
    </>}
  </Pressable>;
}

export function QuietButton({ children, onPress, icon, danger = false, style }:
  { children: ReactNode; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; danger?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quiet, { backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.72 : 1 }, style]}>
    {icon ? <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.ink} /> : null}
    <AppText size={15} weight="medium" style={{ color: danger ? colors.danger : colors.ink }}>{children}</AppText>
  </Pressable>;
}

export function Surface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[styles.surface, { backgroundColor: colors.surface, borderColor: colors.line }, style]}>{children}</View>;
}

export function Pill({ children, active, onPress, style }: { children: ReactNode; active?: boolean; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: !!active }} disabled={!onPress} onPress={onPress}
    style={({ pressed }) => [styles.pill, { backgroundColor: active ? colors.accent : colors.surfaceAlt, opacity: pressed ? 0.8 : 1 }, style]}>
    <Text style={{ color: active ? colors.lightText : colors.ink, fontSize: 14, fontWeight: '600' }}>{children}</Text>
  </Pressable>;
}

export function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  const { colors } = useTheme();
  return <View style={{ marginBottom: spacing.xl }}>
    {onBack ? <Pressable accessibilityLabel="返回" onPress={onBack} style={{ width: 44, height: 44, justifyContent: 'center', marginBottom: 12 }}>
      <Ionicons name="arrow-back" size={24} color={colors.ink} />
    </Pressable> : null}
    <Title>{title}</Title>
    {subtitle ? <AppText muted style={{ marginTop: 8 }}>{subtitle}</AppText> : null}
  </View>;
}

export function FocusOrb({ main, caption, size = 260, progress = 0 }: { main: string; caption: string; size?: number; progress?: number }) {
  const { colors } = useTheme();
  const ring = Math.min(1, Math.max(0, progress));
  return <View style={{ width: size + 36, height: size + 36, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
    <View style={{ position: 'absolute', width: size + 34, height: size + 34, borderRadius: (size + 34) / 2,
      borderWidth: 1, borderColor: colors.line }} />
    <View style={{ position: 'absolute', width: size + 18, height: size + 18, borderRadius: (size + 18) / 2,
      borderWidth: 5, borderColor: colors.accentSoft, opacity: 0.8 }} />
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.orbInner, borderWidth: 8, borderColor: colors.orbOuter }}>
      <Text style={{ color: colors.ink, fontSize: size > 200 ? 58 : 43, fontWeight: '300', letterSpacing: -2,
        fontVariant: ['tabular-nums'] }}>{main}</Text>
      <AppText size={14} muted>{caption}</AppText>
    </View>
    <View style={{ position: 'absolute', top: 9, left: (size + 36) / 2 - 4, height: 8, width: 8,
      borderRadius: 4, backgroundColor: ring > 0 ? colors.accent : colors.accentSoft }} />
  </View>;
}

export function InlineAction({ children, onPress, icon }: { children: ReactNode; onPress: PressableProps['onPress']; icon?: keyof typeof Ionicons.glyphMap }) {
  const { colors } = useTheme();
  return <Pressable onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}>
    <AppText size={14} weight="medium" style={{ color: colors.accent }}>{children}</AppText>
    {icon ? <Ionicons name={icon} size={16} color={colors.accent} /> : null}
  </Pressable>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  primary: { minHeight: 58, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 22 },
  quiet: { minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
  surface: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  pill: { minHeight: 42, paddingHorizontal: 18, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
