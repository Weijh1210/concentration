import { Alert, Platform } from 'react-native';

export function confirmAction(title: string, message: string, confirmLabel: string, action: () => void): void {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) action();
    return;
  }
  Alert.alert(title, message, [
    { text: '取消', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: action },
  ]);
}
