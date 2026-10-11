import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { selectActiveSession, useAppStore } from '../src/application/store';
import { AVAILABLE_MINUTES } from '../src/domain/recommend';
import { ruleFocusPlan, summarizeFocusHistory, type FocusPlan, type TaskType } from '../src/domain/focusRecommendation';
import type { Energy, Friction, StateInput } from '../src/domain/types';
import { AppText, FocusOrb, Header, Pill, PrimaryButton, QuietButton, Screen, Surface } from '../src/ui/components';

const taskTypes: TaskType[] = ['study','reading','writing','practice','review','general'];
const fallbackLabels: Record<string,string> = {
  not_configured:'服务端尚未配置模型',rate_limited:'今天或当前分钟的调用次数已达上限',
  budget_unavailable:'调用预算暂不可用',duplicate_request:'请求已处理',timeout:'请求超时',
  quota:'模型配额不足',provider:'模型服务暂不可用',invalid_output:'模型建议未通过校验',
  config:'模型配置无效',invalid_provider:'模型服务商配置无效',
  network_or_service_error:'网络或服务异常',sign_in_required:'需要登录',
};
export default function RecommendationScreen() {
  const params = useLocalSearchParams<{taskId?:string;taskType?:string;energy?:string;friction?:string;availableMinutes?:string}>();
  const tasks = useAppStore(s => s.tasks);
  const sessions = useAppStore(s => s.sessions);
  const feedback = useAppStore(s => s.feedback);
  const recommendations = useAppStore(s => s.recommendations);
  const authUser = useAppStore(s => s.authUser);
  const cloudConfigured = useAppStore(s => s.cloudConfigured);
  const prepare = useAppStore(s => s.prepareRecommendation);
  const askAi = useAppStore(s => s.requestAiRecommendation);
  const reject = useAppStore(s => s.rejectRecommendation);
  const start = useAppStore(s => s.startRecommendedSession);
  const [recordId,setRecordId] = useState<string | null>(null);
  const [aiBusy,setAiBusy] = useState(false);
  const [busy,setBusy] = useState(false);
  const [minutes,setMinutes] = useState<number | null>(null);
  const [warmup,setWarmup] = useState<0|5|null>(null);
  const [breakMinutes,setBreakMinutes] = useState<number | null>(null);
  const [environment,setEnvironment] = useState<FocusPlan['recommended_environment'] | null>(null);
  const prepared = useRef(false);
  const state = useMemo<StateInput>(() => ({
    energy:(['low','medium','high'].includes(params.energy ?? '') ? params.energy : 'medium') as Energy,
    startFriction:(params.friction === 'high' ? 'high' : 'low') as Friction,
    availableMinutes:AVAILABLE_MINUTES.find(value => value === Number(params.availableMinutes)) ?? 25,
  }),[params.energy,params.friction,params.availableMinutes]);
  const taskType = taskTypes.find(value => value === params.taskType) ?? 'general';
  const task = tasks.find(item => item.id === params.taskId && item.deletedAt === null);
  const fallback = useMemo(() => ruleFocusPlan({taskTitle:task?.title ?? '自由专注',taskNotes:task?.notes ?? '',
    taskType,state,history:summarizeFocusHistory(sessions,feedback)}),[task?.title,task?.notes,taskType,state,sessions,feedback]);
  useEffect(() => {
    if (prepared.current) return;
    prepared.current = true;
    void prepare(task?.id ?? null,taskType,state).then(rec => setRecordId(rec.id)).catch(() => { prepared.current = false; });
  },[prepare,task?.id,taskType,state]);
  const record = recommendations.find(item => item.id === recordId);
  const plan = record?.plan ?? fallback;
  useEffect(() => {
    setMinutes(plan.focus_minutes); setWarmup(plan.warmup_minutes);
    setBreakMinutes(plan.break_minutes); setEnvironment(plan.recommended_environment);
  },[plan.focus_minutes,plan.warmup_minutes,plan.break_minutes,plan.recommended_environment]);
  const selectedWarmup = warmup ?? plan.warmup_minutes;
  const selectedBreak = breakMinutes ?? plan.break_minutes;
  const selectedMinutes = minutes ?? plan.focus_minutes;
  const selectedEnvironment = environment ?? plan.recommended_environment;
  const maxFocus = state.availableMinutes - selectedWarmup - selectedBreak;
  const options = Array.from(new Set([1,5,10,15,20,25,35,45,60,plan.focus_minutes]))
    .filter(value => value <= maxFocus).sort((a,b) => a-b);
  const finalPlan: FocusPlan = {...plan,warmup_minutes:selectedWarmup,focus_minutes:selectedMinutes,
    break_minutes:selectedBreak,recommended_environment:selectedEnvironment};
  const leave = async () => {
    if (recordId) await reject(recordId);
    router.back();
  };
  const requestAi = async () => {
    if (!authUser) { router.push('/account'); return; }
    if (!recordId || aiBusy) return;
    setAiBusy(true);
    try { await askAi(recordId); }
    catch (error) { Alert.alert('推荐暂不可用',error instanceof Error ? error.message : '请稍后重试'); }
    finally { setAiBusy(false); }
  };
  const begin = async () => {
    if (!recordId) return;
    if (selectActiveSession(sessions)) { Alert.alert('已有进行中的专注','请先完成当前会话。'); return; }
    if (selectedMinutes > maxFocus || selectedMinutes < 1) { Alert.alert('时间超出可用范围','请缩短专注时间。'); return; }
    setBusy(true);
    try {
      await start(recordId,finalPlan);
      router.replace(selectedWarmup === 5 ? '/focus/start' : '/focus/timer');
    } catch { /* global store error is displayed by root layout */ }
    finally { setBusy(false); }
  };
  return <Screen>
    <Header title="适合现在的节奏" subtitle={record?.source === 'ai' ? 'AI 为这次任务整理的建议' : '离线规则建议，随时可以开始'}
      onBack={() => { void leave(); }} />
    <FocusOrb main={`${selectedMinutes}`} caption="分钟专注" size={188} />
    <Surface style={{marginTop:20}}>
      <AppText size={13} muted>{plan.task_title}</AppText>
      <AppText size={18} weight="medium" style={{marginTop:8}}>{plan.recommendation_reason}</AppText>
      <AppText size={14} weight="bold" style={{marginTop:20,marginBottom:8}}>从这几步开始</AppText>
      {plan.subtasks.map((item,index) => <AppText key={`${index}-${item}`} size={14} style={{marginTop:5}}>{index+1}. {item}</AppText>)}
      <AppText size={13} muted style={{marginTop:18}}>
        {selectedWarmup ? `先启动 ${selectedWarmup} 分钟 · ` : ''}专注 {selectedMinutes} 分钟
        {selectedBreak ? ` · 结束后休息 ${selectedBreak} 分钟` : ''}
      </AppText>
    </Surface>
    {record?.fallbackReason ? <AppText size={13} muted style={{marginTop:10}}>
      AI 暂不可用，已使用离线规则方案（{fallbackLabels[record.fallbackReason] ?? '暂时无法生成'}）。
    </AppText> : null}
    <AppText weight="medium" style={{marginTop:26,marginBottom:12}}>调整专注时间</AppText>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>
      {options.map(value => <Pill key={value} active={selectedMinutes === value} onPress={() => setMinutes(value)}>{value} 分钟</Pill>)}
    </View>
    {state.availableMinutes > 5 ? <View style={{marginTop:24}}>
      <AppText weight="medium" style={{marginBottom:12}}>启动与休息</AppText>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:9}}>
        <Pill active={selectedWarmup === 5} onPress={() => {setWarmup(5);setMinutes(Math.min(selectedMinutes,state.availableMinutes-5-selectedBreak));}}>5 分钟启动</Pill>
        <Pill active={selectedWarmup === 0} onPress={() => setWarmup(0)}>直接开始</Pill>
        <Pill active={selectedBreak === 5} onPress={() => {setBreakMinutes(5);setMinutes(Math.min(selectedMinutes,state.availableMinutes-selectedWarmup-5));}}>休息 5 分钟</Pill>
        <Pill active={selectedBreak === 0} onPress={() => setBreakMinutes(0)}>稍后休息</Pill>
      </View>
    </View> : null}
    <AppText weight="medium" style={{marginTop:24,marginBottom:12}}>环境</AppText>
    <View style={{flexDirection:'row',gap:9}}>
      <Pill active={selectedEnvironment === 'quiet'} onPress={() => setEnvironment('quiet')}>安静</Pill>
      <Pill active={selectedEnvironment === 'soft_noise'} onPress={() => setEnvironment('soft_noise')}>柔和白噪音</Pill>
    </View>
    {cloudConfigured ? <QuietButton icon="sparkles-outline" style={{marginTop:28}} onPress={() => { void requestAi(); }}>
      {aiBusy ? '正在生成建议…' : authUser ? '让 AI 拆解这次任务' : '登录后使用 AI 建议'}
    </QuietButton> : <AppText size={13} muted style={{marginTop:24}}>AI 建议需先配置 Supabase；离线规则已可使用。</AppText>}
    <PrimaryButton icon="play" loading={busy} disabled={!recordId || aiBusy || selectedMinutes > maxFocus}
      onPress={() => {void begin();}} style={{marginTop:18}}>开始专注</PrimaryButton>
    <QuietButton style={{marginTop:10,marginBottom:12}} onPress={() => {void leave();}}>不采用这次建议</QuietButton>
  </Screen>;
}
