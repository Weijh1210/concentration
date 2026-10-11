import type { EndReason, FocusSession, Recommendation, SessionPhase, StateInput } from './types';

export const START_MODE_MS = 5 * 60_000;
const MAX_REASONABLE_GAP_MS = 24 * 60 * 60_000;

export function createSession(id: string, taskId: string | null, state: StateInput, plan: Recommendation, now: number): FocusSession {
  const phase = plan.useStartMode ? 'start_mode' : 'focus';
  return {
    id, taskId, status: plan.useStartMode ? 'start_mode' : 'focusing', phase,
    startedAt: now, endedAt: null, activeSegmentStartedAt: now, pausedAt: null,
    accumulatedStartMs: 0, accumulatedFocusMs: 0, plannedDurationMs: plan.plannedMinutes * 60_000,
    extended: false, state, recommendationReasonCode: plan.reasonCode,
    recommendationRuleVersion: plan.ruleVersion, endReason: null, clockWarning: false,
    createdAt: now, updatedAt: now,
  };
}

function activeDelta(session: FocusSession, now: number): number {
  if (session.activeSegmentStartedAt === null) return 0;
  return Math.max(0, now - session.activeSegmentStartedAt);
}

export function phaseElapsedMs(session: FocusSession, now: number): number {
  const base = session.phase === 'start_mode' ? session.accumulatedStartMs : session.accumulatedFocusMs;
  const raw = base + activeDelta(session, now);
  if (session.phase === 'start_mode') return Math.min(START_MODE_MS, raw);
  return session.extended ? raw : Math.min(session.plannedDurationMs, raw);
}

export function isStartComplete(session: FocusSession, now: number): boolean {
  return session.phase === 'start_mode' && phaseElapsedMs(session, now) >= START_MODE_MS;
}

function settle(session: FocusSession, now: number): FocusSession {
  const elapsed = phaseElapsedMs(session, now);
  return session.phase === 'start_mode'
    ? { ...session, accumulatedStartMs: elapsed, activeSegmentStartedAt: null, updatedAt: now }
    : { ...session, accumulatedFocusMs: elapsed, activeSegmentStartedAt: null, updatedAt: now };
}

export function reconcileSession(session: FocusSession, now: number): FocusSession {
  if (session.activeSegmentStartedAt === null || session.status === 'finished' || session.status === 'abandoned') return session;
  const gap = now - session.activeSegmentStartedAt;
  if (gap < 0 || gap > MAX_REASONABLE_GAP_MS) {
    return { ...session, status: 'paused', activeSegmentStartedAt: null, pausedAt: now, clockWarning: true, updatedAt: now };
  }
  if (session.phase === 'start_mode' && isStartComplete(session, now)) return settle(session, now);
  if (session.phase === 'focus' && !session.extended && phaseElapsedMs(session, now) >= session.plannedDurationMs) {
    return { ...settle(session, now), status: 'awaiting_finish' };
  }
  return session;
}

export function pauseSession(session: FocusSession, now: number): FocusSession {
  if (session.status !== 'start_mode' && session.status !== 'focusing') throw new Error('当前会话无法暂停');
  return { ...settle(session, now), status: 'paused', pausedAt: now };
}

export function resumeSession(session: FocusSession, now: number): FocusSession {
  if (session.status !== 'paused') throw new Error('当前会话无法恢复');
  const phase: SessionPhase = session.phase;
  return { ...session, status: phase === 'start_mode' ? 'start_mode' : 'focusing',
    activeSegmentStartedAt: now, pausedAt: null, clockWarning: false, updatedAt: now };
}

export function continueAfterStart(session: FocusSession, now: number): FocusSession {
  if (session.phase !== 'start_mode' || !['start_mode', 'paused'].includes(session.status)) throw new Error('当前不在启动阶段');
  return { ...settle(session, now), status: 'focusing', phase: 'focus',
    activeSegmentStartedAt: now, pausedAt: null, clockWarning: false, updatedAt: now };
}

export function continueAfterGoal(session: FocusSession, now: number): FocusSession {
  if (session.status !== 'awaiting_finish') throw new Error('尚未到达计划时长');
  return { ...session, status: 'focusing', extended: true, activeSegmentStartedAt: now, updatedAt: now };
}

export function endSession(session: FocusSession, now: number, reason: EndReason): FocusSession {
  if (session.status === 'finished' || session.status === 'abandoned') throw new Error('会话已结束');
  const settled = settle(session, now);
  const total = settled.accumulatedStartMs + settled.accumulatedFocusMs;
  return { ...settled, status: total > 0 ? 'finished' : 'abandoned', endedAt: now,
    endReason: reason, pausedAt: null, updatedAt: now };
}

export function totalFocusMs(session: FocusSession): number {
  return session.accumulatedStartMs + session.accumulatedFocusMs;
}
