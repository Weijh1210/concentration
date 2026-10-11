import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const cloudConfigured = !!(url && key);
let singleton: SupabaseClient | null = null;
const nativeStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};
export function getCloudClient(): SupabaseClient | null {
  if (!cloudConfigured) return null;
  if (!singleton) {
    singleton = createClient(url!, key!, {
      auth: { storage: Platform.OS === 'web' ? undefined : nativeStorage,
        autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    });
    if (Platform.OS !== 'web') AppState.addEventListener('change', state => {
      if (state === 'active') singleton?.auth.startAutoRefresh();
      else singleton?.auth.stopAutoRefresh();
    });
  }
  return singleton;
}
