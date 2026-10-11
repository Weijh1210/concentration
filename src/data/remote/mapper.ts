import type { FocusSession, SessionFeedback, Task } from '../../domain/types';
import type { EntityType } from '../local/database';
import type { FocusRecommendationRecord } from '../../domain/focusRecommendation';
const iso = (value: number | null) => value === null ? null : new Date(value).toISOString();
const ms = (value: string | null) => value === null ? null : Date.parse(value);
export function toCloudPayload(type: EntityType, value: Task | FocusSession | SessionFeedback | FocusRecommendationRecord, userId: string): Record<string, unknown> {
  if (type === 'task') {
    const t = value as Task;
    return { id: t.id, user_id: userId, title: t.title, notes: t.notes,
      estimated_minutes: t.estimatedMinutes, status: t.status,
      completed_at: t.status === 'completed' ? iso(t.updatedAt) : null,
      created_at: iso(t.createdAt), deleted_at: iso(t.deletedAt) };
  }
  if (type === 'session') {
    const s = value as FocusSession;
    return { id: s.id, user_id: userId, task_id: s.taskId, environment_id: null,
      status: s.status, phase: s.phase, started_at: iso(s.startedAt), ended_at: iso(s.endedAt),
      active_segment_started_at: iso(s.activeSegmentStartedAt), paused_at: iso(s.pausedAt),
      accumulated_start_ms: s.accumulatedStartMs, accumulated_focus_ms: s.accumulatedFocusMs,
      planned_duration_ms: s.plannedDurationMs, extended: s.extended,
      energy: s.state.energy, start_friction: s.state.startFriction,
      available_minutes: s.state.availableMinutes,
      recommendation_reason_code: s.recommendationReasonCode,
      recommendation_rule_version: s.recommendationRuleVersion,
      end_reason: s.endReason, clock_warning: s.clockWarning, created_at: iso(s.createdAt) };
  }
  if (type === 'recommendation') {
    const r = value as FocusRecommendationRecord;
    return { id:r.id,user_id:userId,task_id:r.taskId,task_type:r.taskType,input_json:r.input,
      plan_json:r.plan,final_plan_json:r.finalPlan,source:r.source,fallback_reason:r.fallbackReason,
      decision:r.decision,session_id:r.sessionId,session_status:r.sessionStatus,
      actual_focus_ms:r.actualFocusMs,feedback_focus:r.feedbackFocus,created_at:iso(r.createdAt) };
  }
  const f = value as SessionFeedback;
  return { session_id: f.sessionId, user_id: userId, perceived_focus: f.perceivedFocus,
    interruption_count: f.interruptionCount, note: f.note, created_at: iso(f.createdAt) };
}
export function fromCloudTask(r: Record<string, any>): Task {
  return { id: r.id, title: r.title, notes: r.notes, estimatedMinutes: r.estimated_minutes,
    status: r.status, createdAt: Date.parse(r.created_at), updatedAt: Date.parse(r.updated_at), deletedAt: ms(r.deleted_at) };
}
export function fromCloudSession(r: Record<string, any>): FocusSession {
  return { id: r.id, taskId: r.task_id, status: r.status, phase: r.phase,
    startedAt: Date.parse(r.started_at), endedAt: ms(r.ended_at),
    activeSegmentStartedAt: ms(r.active_segment_started_at), pausedAt: ms(r.paused_at),
    accumulatedStartMs: Number(r.accumulated_start_ms), accumulatedFocusMs: Number(r.accumulated_focus_ms),
    plannedDurationMs: r.planned_duration_ms, extended: r.extended,
    state: { energy: r.energy, startFriction: r.start_friction, availableMinutes: r.available_minutes },
    recommendationReasonCode: r.recommendation_reason_code, recommendationRuleVersion: r.recommendation_rule_version,
    endReason: r.end_reason, clockWarning: r.clock_warning,
    createdAt: Date.parse(r.created_at), updatedAt: Date.parse(r.updated_at) };
}
export function fromCloudFeedback(r: Record<string, any>): SessionFeedback {
  return { sessionId: r.session_id, perceivedFocus: r.perceived_focus,
    interruptionCount: r.interruption_count, note: r.note,
    createdAt: Date.parse(r.created_at), updatedAt: Date.parse(r.updated_at) };
}

export function fromCloudRecommendation(r: Record<string, any>): FocusRecommendationRecord {
  return { id:r.id,taskId:r.task_id,taskType:r.task_type,input:r.input_json,plan:r.plan_json,
    finalPlan:r.final_plan_json,source:r.source,fallbackReason:r.fallback_reason,
    decision:r.decision,sessionId:r.session_id,sessionStatus:r.session_status,
    actualFocusMs:r.actual_focus_ms === null ? null : Number(r.actual_focus_ms),
    feedbackFocus:r.feedback_focus,createdAt:Date.parse(r.created_at),updatedAt:Date.parse(r.updated_at) };
}
