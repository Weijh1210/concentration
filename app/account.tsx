import { useState } from 'react';
import { router } from 'expo-router';
import { TextInput, View } from 'react-native';
import { useAppStore } from '../src/application/store';
import { AppText, Header, Pill, PrimaryButton, Screen, Surface } from '../src/ui/components';
import { useTheme } from '../src/ui/theme';
export default function Account() {
  const { colors } = useTheme();
  const [mode,setMode] = useState<'login'|'register'>('login');
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const configured = useAppStore(s => s.cloudConfigured);
  const signUp = useAppStore(s => s.signUp);
  const signIn = useAppStore(s => s.signIn);
  const inputStyle = { color:colors.ink,backgroundColor:colors.surfaceAlt,borderColor:colors.line,
    borderWidth:1,borderRadius:14,paddingHorizontal:16,minHeight:52,marginTop:10,fontSize:16 } as const;
  async function submit() {
    setBusy(true); setMessage('');
    try {
      if (mode === 'register') {
        const active = await signUp(email,password);
        if (active) router.back();
        else setMessage('注册邮件已发送。请完成邮箱确认，再返回此页登录。');
      } else { await signIn(email,password); router.back(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : '操作失败'); }
    finally { setBusy(false); }
  }
  return <Screen>
    <Header title="你的专注账号" subtitle="登录后，记录会在这台设备优先保存，并在联网时同步。" onBack={() => router.back()} />
    {!configured ? <Surface><AppText>尚未配置 Supabase。当前仍可完整使用本机游客体验。</AppText>
      <AppText size={13} muted style={{marginTop:8}}>请按 README 配置 EXPO_PUBLIC_SUPABASE_URL 和 Publishable Key。</AppText></Surface>
      : <Surface>
        <View style={{flexDirection:'row',gap:10,marginBottom:18}}>
          <Pill active={mode === 'login'} onPress={() => setMode('login')}>登录</Pill>
          <Pill active={mode === 'register'} onPress={() => setMode('register')}>注册</Pill>
        </View>
        <AppText size={14} weight="medium">邮箱</AppText>
        <TextInput autoCapitalize="none" keyboardType="email-address" autoComplete="email"
          value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.muted}
          style={inputStyle} />
        <AppText size={14} weight="medium" style={{marginTop:18}}>密码</AppText>
        <TextInput secureTextEntry autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          value={password} onChangeText={setPassword} placeholder="至少 6 位" placeholderTextColor={colors.muted}
          style={inputStyle} />
        <PrimaryButton loading={busy} disabled={!email.includes('@') || password.length < 6}
          style={{marginTop:24}} onPress={() => { void submit(); }}>
          {mode === 'register' ? '创建账号' : '登录'}
        </PrimaryButton>
        {message ? <AppText size={14} style={{marginTop:14}}>{message}</AppText> : null}
      </Surface>}
  </Screen>;
}
