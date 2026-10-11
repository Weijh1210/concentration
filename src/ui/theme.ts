import { useColorScheme } from 'react-native';
import { useAppStore } from '../application/store';

export const spacing = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 12, md: 20, lg: 28, xl: 38 } as const;

const light = {
  background: '#F1F6F5', backgroundEnd: '#E6F0ED', surface: '#FFFFFF', surfaceAlt: '#E7F0EC',
  ink: '#153533', muted: '#607A74', accent: '#316B61', accentSoft: '#CDE1D7',
  line: '#D7E4E0', warm: '#E9D4B7', danger: '#A34B4B', lightText: '#F7FCF9',
  orbInner: '#D7E9E1', orbOuter: '#E6F2EB',
};

const dark = {
  background: '#0D2529', backgroundEnd: '#123035', surface: '#19363A', surfaceAlt: '#244449',
  ink: '#EDF8F5', muted: '#9CB9B4', accent: '#B0DCC9', accentSoft: '#305751',
  line: '#335158', warm: '#DCC39F', danger: '#F2A5A1', lightText: '#102D2D',
  orbInner: '#315754', orbOuter: '#244846',
};

export type Palette = typeof light;

export function useTheme(): { colors: Palette; dark: boolean } {
  const preference = useAppStore((state) => state.themePreference);
  const system = useColorScheme();
  const isDark = preference === 'dark' || (preference === 'system' && system === 'dark');
  return { colors: isDark ? dark : light, dark: isDark };
}
