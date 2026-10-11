import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { clearLocalData, clearScope, getSetting, listFeedback, listSessions, listTasks, listRecommendations, saveRecommendation, saveSessionWithRecommendation, saveFeedbackWithRecommendation, listConflicts, rebaseEntity, discardEntityChanges, pendingCounts, saveFeedback, saveSession, saveTask, setSetting } from '../data/local/database';
import { getCloudClient, cloudConfigured } from '../data/remote/client';
import { createCloudTransport } from '../data/remote/api';
import { syncOnce } from '../data/sync/engine';
import { sqliteRepository } from '../data/sync/repository';
import { recommend } from '../domain/recommend';
import { recommendationDecision, ruleFocusPlan, summarizeFocusHistory, validateFocusPlan,
  type FocusPlan, type FocusRecommendationRecord, type TaskType } from '../domain/focusRecommendation';
import { continueAfterGoal, continueAfterStart, createSession, endSession, pauseSession, reconcileSession, resumeSession } from '../domain/session';
import type { EndReason, FocusSession, SessionFeedback, StateInput, Task } from '../domain/types';

export type ThemePreference = 'system' | 'light' | 'dark';
const activeStatuses = new Set<FocusSession['status']>(['start_mode', 'focusing', 'paused', 'awaiting_finish']);

interface AppState {
  ready: boolean;
  authUser: { id: string; email: string | undefined } | null;
  cloudConfigured: boolean;
  syncState: 'local' | 'idle' | 'syncing' | 'offline' | 'conflict';
  pendingCount: number;
  conflictCount: number;
  signUp: (email: string, password: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  importGuestData: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  resolveConflicts: (strategy: 'cloud' | 'local') => Promise<void>;
  error: string | null;
  tasks: Task[];
  sessions: FocusSession[];
  feedback: SessionFeedback[];
  recommendations: FocusRecommendationRecord[];
  prepareRecommendation: (taskId: string | null, taskType: TaskType, state: StateInput) => Promise<FocusRecommendationRecord>;
  requestAiRecommendation: (id: string) => Promise<FocusRecommendationRecord>;
  rejectRecommendation: (id: string) => Promise<void>;
  startRecommendedSession: (id: string, finalPlan: FocusPlan) => Promise<FocusSession>;
  welcomeSeen: boolean;
  themePreference: ThemePreference;
  soundEnabled: boolean;
  soundVolume: number;
  bootstrap: () => Promise<void>;
  clearError: () => void;
  completeWelcome: () => Promise<void>;
  setThemePreference: (value: ThemePreference) => Promise<void>;
  setSoundEnabled: (value: boolean) => Promise<void>;
  setSoundVolume: (value: number) => Promise<void>;
  createTask: (title: string, notes: string, estimatedMinutes: number | null) => Promise<Task>;
  editTask: (id: string, title: string, notes: string, estimatedMinutes: number | null) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  startSession: (taskId: string | null, state: StateInput, plannedMinutes: number, useStartMode: boolean) => Promise<FocusSession>;
  updateSession: (action: 'pause' | 'resume' | 'continueStart' | 'continueGoal' | 'reconcile' | 'finish', reason?: EndReason) => Promise<FocusSession | null>;
  submitFeedback: (sessionId: string, focus: number | null, interruptions: 0 | 1 | 2 | null, note: string) => Promise<void>;
  clearAllData: () => Promise<void>;
}

let bootstrapPromise: Promise<void> | null = null;
let syncPromise: Promise<void> | null = null;
const scopeOf = (userId: string | undefined) => userId ? `user:${userId}` : 'guest';
let mutationQueue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = mutationQueue.then(work, work);
  mutationQueue = next.catch(() => undefined);
  return next;
}

function reportError(set: (value: Partial<AppState>) => void, error: unknown): never {
  const message = error instanceof Error ? error.message : '操作失败，请重试';
  set({ error: message });
  throw error;
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false, error: null, tasks: [], sessions: [], feedback: [], recommendations: [], welcomeSeen: false,
  authUser: null, cloudConfigured, syncState: 'local', pendingCount: 0, conflictCount: 0,
  themePreference: 'system', soundEnabled: false, soundVolume: 0.5,
  clearError: () => set({ error: null }),
  bootstrap: async () => {
    bootstrapPromise ??= (async () => {
      set({ error: null });
      try {
        const client = getCloudClient();
        const authSession = client ? (await client.auth.getSession()).data.session : null;
        const user = authSession?.user ?? null;
        const scope = scopeOf(user?.id);
        const [tasks, sessions, feedback, recommendations, welcome, theme, sound, volume] = await Promise.all([
          listTasks(scope), listSessions(scope), listFeedback(scope), listRecommendations(scope), getSetting('welcome_seen'), getSetting('theme'),
          getSetting('sound_enabled'), getSetting('sound_volume'),
        ]);
        const latest = sessions.find((session) => activeStatuses.has(session.status));
        if (latest) {
          const updated = reconcileSession(latest, Date.now());
          if (updated !== latest) {
            const linked = recommendations.find(item => item.sessionId === updated.id);
            if (linked && (updated.status === 'finished' || updated.status === 'abandoned')) {
              const outcome: FocusRecommendationRecord = {...linked,sessionStatus:updated.status,
                actualFocusMs:updated.accumulatedFocusMs,updatedAt:Date.now()};
              await saveSessionWithRecommendation(updated,outcome,scope);
              recommendations.splice(recommendations.indexOf(linked),1,outcome);
            } else await saveSession(updated, scope);
            sessions.splice(sessions.findIndex((session) => session.id === latest.id), 1, updated);
          }
        }
        set({ tasks, sessions, feedback, recommendations, authUser: user ? { id: user.id, email: user.email } : null,
          syncState: user ? 'idle' : 'local', welcomeSeen: welcome === 'true',
          themePreference: theme === 'light' || theme === 'dark' ? theme : 'system',
          soundEnabled: sound === 'true', soundVolume: volume === null ? 0.5 : Math.max(0, Math.min(1, Number(volume))),
          ready: true });
        if (user) void get().syncNow();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : '本地数据加载失败', ready: false });
        bootstrapPromise = null;
      }
    })();
    await bootstrapPromise;
  },
  completeWelcome: () => serial(async () => {
    try { await setSetting('welcome_seen', 'true'); set({ welcomeSeen: true }); }
    catch (error) { reportError(set, error); }
  }),
  setThemePreference: (value) => serial(async () => {
    try { await setSetting('theme', value); set({ themePreference: value }); }
    catch (error) { reportError(set, error); }
  }),
  setSoundEnabled: (value) => serial(async () => {
    try { await setSetting('sound_enabled', String(value)); set({ soundEnabled: value }); }
    catch (error) { reportError(set, error); }
  }),
  setSoundVolume: (value) => serial(async () => {
    const clamped = Math.max(0, Math.min(1, value));
    try { await setSetting('sound_volume', String(clamped)); set({ soundVolume: clamped }); }
    catch (error) { reportError(set, error); }
  }),
  createTask: (title, notes, estimatedMinutes) => serial(async () => {
    const now = Date.now();
    const task: Task = { id: Crypto.randomUUID(), title: title.trim(), notes: notes.trim(),
      estimatedMinutes, status: 'open', createdAt: now, updatedAt: now, deletedAt: null };
    if (!task.title) throw new Error('请输入任务名称');
    try { await saveTask(task, scopeOf(get().authUser?.id)); set({ tasks: [task, ...get().tasks] }); void get().syncNow(); return task; }
    catch (error) { return reportError(set, error); }
  }),
  editTask: (id, title, notes, estimatedMinutes) => serial(async () => {
    const original = get().tasks.find((task) => task.id === id);
    if (!original) throw new Error('任务不存在');
    if (!title.trim()) throw new Error('请输入任务名称');
    const task = { ...original, title: title.trim(), notes: notes.trim(), estimatedMinutes, updatedAt: Date.now() };
    try { await saveTask(task, scopeOf(get().authUser?.id)); set({ tasks: get().tasks.map((item) => item.id === id ? task : item) }); void get().syncNow(); }
    catch (error) { reportError(set, error); }
  }),
  toggleTask: (id) => serial(async () => {
    const original = get().tasks.find((task) => task.id === id);
    if (!original) throw new Error('任务不存在');
    const now = Date.now();
    const task: Task = { ...original, status: original.status === 'open' ? 'completed' : 'open', updatedAt: now };
    try { await saveTask(task, scopeOf(get().authUser?.id)); set({ tasks: get().tasks.map((item) => item.id === id ? task : item) }); void get().syncNow(); }
    catch (error) { reportError(set, error); }
  }),
  deleteTask: (id) => serial(async () => {
    const original = get().tasks.find((task) => task.id === id);
    if (!original) throw new Error('任务不存在');
    const now = Date.now();
    const task = { ...original, deletedAt: now, updatedAt: now };
    try { await saveTask(task, scopeOf(get().authUser?.id)); set({ tasks: get().tasks.map((item) => item.id === id ? task : item) }); void get().syncNow(); }
    catch (error) { reportError(set, error); }
  }),
  prepareRecommendation: (taskId, taskType, state) => serial(async () => {
    const task = get().tasks.find(item => item.id === taskId && item.deletedAt === null);
    const input = { taskTitle:task?.title ?? '自由专注',taskNotes:task?.notes ?? '', taskType,state,
      history:summarizeFocusHistory(get().sessions,get().feedback) };
    const plan = ruleFocusPlan(input);
    const now = Date.now();
    const value: FocusRecommendationRecord = { id:Crypto.randomUUID(),taskId:task?.id ?? null,
      taskType,input,plan,finalPlan:null,source:'rule',fallbackReason:null,decision:'pending',
      sessionId:null,sessionStatus:null,actualFocusMs:null,feedbackFocus:null,createdAt:now,updatedAt:now };
    try { await saveRecommendation(value,scopeOf(get().authUser?.id));
      set({ recommendations:[value,...get().recommendations] }); void get().syncNow(); return value; }
    catch (error) { return reportError(set,error); }
  }),
  requestAiRecommendation: async (id) => {
    const current = get().recommendations.find(item => item.id === id && item.decision === 'pending');
    if (!current) throw new Error('推荐已处理或不存在');
    const client = getCloudClient();
    let result: {source:'ai'|'rule';plan:FocusPlan;fallback_reason:string|null} | null = null;
    if (get().authUser && client) {
      try {
        const response = await client.functions.invoke('recommend-focus',{body:{
          request_id:Crypto.randomUUID(),task_id:current.taskId,task_type:current.taskType,
          energy:current.input.state.energy,start_friction:current.input.state.startFriction,
          available_minutes:current.input.state.availableMinutes,
        }});
        if (response.error) throw response.error;
        const data = response.data as Record<string,unknown>;
        const plan = validateFocusPlan(data.plan,current.input.state.availableMinutes);
        if (data.source !== 'ai' && data.source !== 'rule') throw new Error('AI 返回来源无效');
        result = {source:data.source,plan,fallback_reason:typeof data.fallback_reason === 'string' ? data.fallback_reason : null};
      } catch { result = null; }
    }
    return serial(async () => {
      const latest = get().recommendations.find(item => item.id === id);
      if (!latest || latest.decision !== 'pending') throw new Error('推荐已处理');
      const updated: FocusRecommendationRecord = { ...latest,
        plan:result?.plan ?? ruleFocusPlan(latest.input),source:result?.source ?? 'rule',
        fallbackReason:result?.fallback_reason ?? (get().authUser ? 'network_or_service_error' : 'sign_in_required'),
        updatedAt:Date.now() };
      await saveRecommendation(updated,scopeOf(get().authUser?.id));
      set({ recommendations:get().recommendations.map(item => item.id === id ? updated : item) });
      void get().syncNow(); return updated;
    });
  },
  rejectRecommendation: (id) => serial(async () => {
    const current = get().recommendations.find(item => item.id === id && item.decision === 'pending');
    if (!current) return;
    const updated: FocusRecommendationRecord = {...current,decision:'rejected',updatedAt:Date.now()};
    await saveRecommendation(updated,scopeOf(get().authUser?.id));
    set({recommendations:get().recommendations.map(item => item.id === id ? updated : item)});
    void get().syncNow();
  }),
  startRecommendedSession: (id, finalPlan) => serial(async () => {
    const rec = get().recommendations.find(item => item.id === id && item.decision === 'pending');
    if (!rec) throw new Error('推荐已处理或不存在');
    if (get().sessions.some(session => activeStatuses.has(session.status))) throw new Error('请先完成当前专注');
    const valid = validateFocusPlan(finalPlan,rec.input.state.availableMinutes);
    const now = Date.now();
    const plan = {plannedMinutes:valid.focus_minutes,useStartMode:valid.warmup_minutes === 5,
      reasonCode:rec.source === 'ai' ? 'AI_FOCUS_V1' : `RULE_${rec.taskType.toUpperCase()}`,
      reason:rec.plan.recommendation_reason,ruleVersion:rec.source === 'ai' ? 'ai-v1' : 'rule-v2'};
    const session = createSession(Crypto.randomUUID(),rec.taskId,rec.input.state,plan,now);
    const decision = recommendationDecision(rec.plan,valid);
    const updated: FocusRecommendationRecord = {...rec,finalPlan:valid,decision,
      sessionId:session.id,sessionStatus:session.status,actualFocusMs:null,updatedAt:now};
    try {
      const scope = scopeOf(get().authUser?.id);
      await saveSessionWithRecommendation(session,updated,scope);
      set({ sessions:[session,...get().sessions],
        recommendations:get().recommendations.map(item => item.id === id ? updated : item) });
      const soundEnabled = valid.recommended_environment === 'soft_noise';
      await setSetting('sound_enabled',String(soundEnabled));
      set({soundEnabled});
      void get().syncNow(); return session;
    } catch (error) { return reportError(set,error); }
  }),
  startSession: (taskId, state, plannedMinutes, useStartMode) => serial(async () => {
    if (get().sessions.some((session) => activeStatuses.has(session.status))) throw new Error('请先完成当前专注');
    if (!Number.isInteger(plannedMinutes) || plannedMinutes < 1 || plannedMinutes + (useStartMode ? 5 : 0) > state.availableMinutes) {
      throw new Error('专注时间不能超过可用时间');
    }
    const basePlan = recommend(state);
    const plan = { ...basePlan, plannedMinutes, useStartMode };
    const session = createSession(Crypto.randomUUID(), taskId, state, plan, Date.now());
    try { await saveSession(session, scopeOf(get().authUser?.id)); set({ sessions: [session, ...get().sessions] }); void get().syncNow(); return session; }
    catch (error) { return reportError(set, error); }
  }),
  updateSession: (action, reason) => serial(async () => {
    const current = get().sessions.find((session) => activeStatuses.has(session.status));
    if (!current) return null;
    const now = Date.now();
    let updated: FocusSession;
    if (action === 'pause') updated = pauseSession(current, now);
    else if (action === 'resume') updated = resumeSession(current, now);
    else if (action === 'continueStart') updated = continueAfterStart(current, now);
    else if (action === 'continueGoal') updated = continueAfterGoal(current, now);
    else if (action === 'finish') updated = endSession(current, now, reason ?? 'user_ended');
    else updated = reconcileSession(current, now);
    if (updated === current) return current;
    try {
      const scope = scopeOf(get().authUser?.id);
      const rec = get().recommendations.find(item => item.sessionId === updated.id);
      if (rec && (updated.status === 'finished' || updated.status === 'abandoned')) {
        const linked: FocusRecommendationRecord = {...rec,sessionStatus:updated.status,
          actualFocusMs:updated.accumulatedFocusMs,updatedAt:now};
        await saveSessionWithRecommendation(updated,linked,scope);
        set({recommendations:get().recommendations.map(item => item.id === linked.id ? linked : item)});
      } else await saveSession(updated,scope);
      set({ sessions: get().sessions.map((item) => item.id === updated.id ? updated : item) });
      void get().syncNow(); return updated;
    }
    catch (error) { return reportError(set, error); }
  }),
  submitFeedback: (sessionId, focus, interruptions, note) => serial(async () => {
    const session = get().sessions.find((item) => item.id === sessionId);
    if (!session || session.status !== 'finished') throw new Error('会话尚未完成');
    const original = get().feedback.find((item) => item.sessionId === sessionId);
    const now = Date.now();
    const value: SessionFeedback = { sessionId, perceivedFocus: focus, interruptionCount: interruptions,
      note: note.trim(), createdAt: original?.createdAt ?? now, updatedAt: now };
    try {
      const scope = scopeOf(get().authUser?.id);
      const rec = get().recommendations.find(item => item.sessionId === sessionId);
      if (rec) {
        const linked: FocusRecommendationRecord = {...rec,feedbackFocus:focus,updatedAt:now};
        await saveFeedbackWithRecommendation(value,linked,scope);
        set({recommendations:get().recommendations.map(item => item.id === linked.id ? linked : item)});
      } else await saveFeedback(value,scope);
      set({ feedback: [value, ...get().feedback.filter((item) => item.sessionId !== sessionId)] });
      void get().syncNow();
    }
    catch (error) { reportError(set, error); }
  }),
  signUp: async (email, password) => {
    const client = getCloudClient(); if (!client) throw new Error('请先配置 Supabase 公开连接参数');
    const { data, error } = await client.auth.signUp({ email: email.trim(), password });
    if (error) return reportError(set,error);
    if (data.session?.user) await switchTo(data.session.user.id,data.session.user.email,set,get);
    return !!data.session;
  },
  signIn: async (email, password) => {
    const client = getCloudClient(); if (!client) throw new Error('请先配置 Supabase 公开连接参数');
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return reportError(set,error);
    await switchTo(data.user.id,data.user.email,set,get);
  },
  signOut: async () => {
    const client = getCloudClient(); if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) return reportError(set,error);
    await switchTo(undefined,undefined,set,get);
  },
  syncNow: async () => {
    const user = get().authUser;
    const client = getCloudClient();
    if (!user || !client) return;
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      const scope = scopeOf(user.id);
      try {
        set({ syncState: 'syncing' });
        const { data, error } = await client.auth.getUser();
        if (error || data.user?.id !== user.id) throw error ?? new Error('登录状态已失效');
        const result = await syncOnce(scope,user.id,createCloudTransport(client),sqliteRepository);
        if (get().authUser?.id !== user.id) return;
        const [tasks,sessions,feedback,recommendations] = await Promise.all([listTasks(scope),listSessions(scope),listFeedback(scope),listRecommendations(scope)]);
        set({ tasks,sessions,feedback,recommendations,pendingCount:result.pending,conflictCount:result.conflicts,
          syncState: result.conflicts ? 'conflict' : result.pending ? 'offline' : 'idle' });
      } catch (error) {
        if (get().authUser?.id === user.id) {
          const counts = await pendingCounts(scope);
          set({ pendingCount:counts.pending,conflictCount:counts.conflict,syncState:'offline',
            error: error instanceof Error ? `同步失败：${error.message}` : '同步失败' });
        }
      } finally { syncPromise = null; }
    })();
    return syncPromise;
  },
  importGuestData: () => serial(async () => {
    const user = get().authUser; if (!user) throw new Error('请先登录');
    const scope = scopeOf(user.id);
    const [tasks,sessions,feedback,recommendations] = await Promise.all([listTasks(),listSessions(),listFeedback(),listRecommendations()]);
    if (sessions.some(s => activeStatuses.has(s.status))) throw new Error('请先结束游客专注会话');
    for (const item of tasks) await saveTask(item,scope);
    for (const item of sessions) await saveSession(item,scope);
    for (const item of feedback) await saveFeedback(item,scope);
    for (const item of recommendations) await saveRecommendation(item,scope);
    const [allTasks,allSessions,allFeedback,allRecommendations] = await Promise.all([listTasks(scope),listSessions(scope),listFeedback(scope),listRecommendations(scope)]);
    set({ tasks:allTasks,sessions:allSessions,feedback:allFeedback,recommendations:allRecommendations });
    void get().syncNow();
  }),
  resolveConflicts: async (strategy) => {
    const user = get().authUser; const client = getCloudClient();
    if (!user || !client) throw new Error('请先登录');
    const scope = scopeOf(user.id);
    const conflicts = await listConflicts(scope);
    for (const item of conflicts) {
      const table = item.entity_type === 'task' ? 'tasks' : item.entity_type === 'session' ? 'focus_sessions' : item.entity_type === 'feedback' ? 'session_feedback' : 'focus_recommendations';
      const key = item.entity_type === 'feedback' ? 'session_id' : 'id';
      const { data,error } = await client.from(table).select('revision').eq('user_id',user.id).eq(key,item.entity_id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('云端记录不存在，无法自动解决此冲突');
      if (strategy === 'cloud') await discardEntityChanges(scope,item.entity_type,item.entity_id);
      else await rebaseEntity(scope,item.entity_type,item.entity_id,Number(data.revision));
    }
    await get().syncNow();
  },
  deleteAccount: async () => {
    const user = get().authUser; const client = getCloudClient();
    if (!user || !client) throw new Error('请先登录');
    if (syncPromise) await syncPromise;
    const { error } = await client.functions.invoke('delete-account', { method: 'POST' });
    if (error) return reportError(set,error);
    set({ authUser:null, tasks:[], sessions:[], feedback:[], recommendations:[], syncState:'local' });
    await clearScope(scopeOf(user.id));
    await client.auth.signOut({ scope:'local' });
    await switchTo(undefined,undefined,set,get);
  },
  clearAllData: () => serial(async () => {
    try { if (get().authUser) await clearScope(scopeOf(get().authUser?.id)); else await clearLocalData();
      set({ tasks: [], sessions: [], feedback: [], recommendations: [], welcomeSeen: false,
      themePreference: 'system', soundEnabled: false, soundVolume: 0.5 }); }
    catch (error) { reportError(set, error); }
  }),
}));

export function selectActiveSession(sessions: FocusSession[]): FocusSession | null {
  return sessions.find((session) => activeStatuses.has(session.status)) ?? null;
}

async function switchTo(id: string | undefined, email: string | undefined,
  set: (value: Partial<AppState>) => void, get: () => AppState): Promise<void> {
  // Never display one account's cache under another account, including when offline.
  const scope = scopeOf(id);
  const [tasks,sessions,feedback,recommendations] = await Promise.all([listTasks(scope),listSessions(scope),listFeedback(scope),listRecommendations(scope)]);
  set({ authUser: id ? { id,email } : null, tasks,sessions,feedback,recommendations,
    syncState: id ? 'idle' : 'local',pendingCount:0,conflictCount:0 });
  if (id) void get().syncNow();
}
