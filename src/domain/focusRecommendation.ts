import type { FocusSession, SessionFeedback, StateInput } from './types.ts';

export type TaskType = 'study' | 'reading' | 'writing' | 'practice' | 'review' | 'general';
export type FocusEnvironment = 'quiet' | 'soft_noise';
export interface FocusPlan {
  task_title: string;
  subtasks: string[];
  warmup_minutes: 0 | 5;
  focus_minutes: number;
  break_minutes: number;
  recommended_environment: FocusEnvironment;
  recommendation_reason: string;
}
export interface FocusHistory {
  sample_count: number;
  completion_rate: number;
  average_focus_minutes: number;
  average_perceived_focus: number | null;
  average_interruptions: number | null;
}
export interface FocusRecommendationInput {
  taskTitle: string;
  taskNotes: string;
  taskType: TaskType;
  state: StateInput;
  history: FocusHistory;
}
export type RecommendationDecision = 'pending' | 'accepted' | 'modified' | 'rejected';
export interface FocusRecommendationRecord {
  id: string;
  taskId: string | null;
  taskType: TaskType;
  input: FocusRecommendationInput;
  plan: FocusPlan;
  finalPlan: FocusPlan | null;
  source: 'rule' | 'ai';
  fallbackReason: string | null;
  decision: RecommendationDecision;
  sessionId: string | null;
  sessionStatus: FocusSession['status'] | null;
  actualFocusMs: number | null;
  feedbackFocus: number | null;
  createdAt: number;
  updatedAt: number;
}

// Strict Structured Outputs schema deliberately uses the widely supported subset.
// Business bounds are checked by validateFocusPlan after generation.
export const FOCUS_PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    task_title: { type: 'string' },
    subtasks: { type: 'array', items: { type: 'string' } },
    warmup_minutes: { type: 'integer', enum: [0, 5] },
    focus_minutes: { type: 'integer' },
    break_minutes: { type: 'integer' },
    recommended_environment: { type: 'string', enum: ['quiet', 'soft_noise'] },
    recommendation_reason: { type: 'string' },
  },
  required: ['task_title','subtasks','warmup_minutes','focus_minutes','break_minutes',
    'recommended_environment','recommendation_reason'],
  additionalProperties: false,
} as const;

function boundedText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
export function validateFocusPlan(raw: unknown, availableMinutes: number): FocusPlan {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('推荐不是 JSON object');
  const value = raw as Record<string, unknown>;
  const expected = Object.keys(FOCUS_PLAN_JSON_SCHEMA.properties);
  if (Object.keys(value).length !== expected.length || expected.some(key => !(key in value))) throw new Error('推荐字段不符合 Schema');
  if (!boundedText(value.task_title,200) || !boundedText(value.recommendation_reason,300)) throw new Error('推荐文字无效');
  if (!Array.isArray(value.subtasks) || value.subtasks.length < 1 || value.subtasks.length > 4 ||
    !value.subtasks.every(item => boundedText(item,100))) throw new Error('任务拆解无效');
  if (value.warmup_minutes !== 0 && value.warmup_minutes !== 5) throw new Error('启动时长无效');
  if (!Number.isInteger(value.focus_minutes) || (value.focus_minutes as number) < 1 || (value.focus_minutes as number) > 60) throw new Error('专注时长无效');
  if (!Number.isInteger(value.break_minutes) || (value.break_minutes as number) < 0 || (value.break_minutes as number) > 10) throw new Error('休息时长无效');
  if (value.recommended_environment !== 'quiet' && value.recommended_environment !== 'soft_noise') throw new Error('环境无效');
  const total = (value.warmup_minutes as number) + (value.focus_minutes as number) + (value.break_minutes as number);
  if (!Number.isInteger(availableMinutes) || availableMinutes < 5 || availableMinutes > 60 || total > availableMinutes) throw new Error('推荐超过可用时间');
  return {
    task_title: (value.task_title as string).trim(),
    subtasks: (value.subtasks as string[]).map(item => item.trim()),
    warmup_minutes: value.warmup_minutes as 0 | 5,
    focus_minutes: value.focus_minutes as number,
    break_minutes: value.break_minutes as number,
    recommended_environment: value.recommended_environment as FocusEnvironment,
    recommendation_reason: (value.recommendation_reason as string).trim(),
  };
}

export function summarizeFocusHistory(
  sessions: Pick<FocusSession,'id' | 'status' | 'startedAt' | 'accumulatedStartMs' | 'accumulatedFocusMs'>[],
  feedback: Pick<SessionFeedback,'sessionId' | 'perceivedFocus' | 'interruptionCount'>[],
): FocusHistory {
  const recent = [...sessions].filter(item => item.status === 'finished' || item.status === 'abandoned')
    .sort((a,b) => b.startedAt - a.startedAt).slice(0,10);
  const finished = recent.filter(item => item.status === 'finished');
  const matching = feedback.filter(item => finished.some(session => session.id === item.sessionId));
  const focusScores = matching.map(item => item.perceivedFocus).filter((value): value is number => value !== null);
  const interruptions = matching.map(item => item.interruptionCount).filter((value): value is 0 | 1 | 2 => value !== null);
  const average = (values: number[]) => values.reduce((sum,value) => sum + value,0) / values.length;
  return {
    sample_count: recent.length,
    completion_rate: recent.length ? finished.length / recent.length : 0,
    average_focus_minutes: finished.length ? Math.round(average(finished.map(item =>
      item.accumulatedFocusMs / 60000))) : 0,
    average_perceived_focus: focusScores.length ? Math.round(average(focusScores) * 10) / 10 : null,
    average_interruptions: interruptions.length ? Math.round(average(interruptions) * 10) / 10 : null,
  };
}
const taskSteps: Record<TaskType, string[]> = {
  study: ['打开本次学习材料', '先完成一个明确的知识点', '用一句话回顾刚学的内容'],
  reading: ['打开要读的章节', '读完一个小节并标出重点', '写下一个关键收获'],
  writing: ['写出这一段的第一句话', '完成一小段初稿', '快速检查并标记下一步'],
  practice: ['准备题目和草稿纸', '独立完成一组题目', '标记需要复盘的题'],
  review: ['列出要回顾的内容', '主动回忆一个重点', '检查遗漏并记录'],
  general: ['打开任务所需材料', '完成最小的一步', '记录下一步从哪里继续'],
};
export function ruleFocusPlan(input: FocusRecommendationInput): FocusPlan {
  const { state, history, taskType } = input;
  const warmup: 0 | 5 = state.startFriction === 'high' && state.availableMinutes > 5 ? 5 : 0;
  const baseCap = state.energy === 'low' ? 15 : state.energy === 'medium' ? 25 : 45;
  const typeCap = taskType === 'writing' || taskType === 'reading' || taskType === 'review' ? 25 :
    taskType === 'practice' ? 45 : taskType === 'study' ? 35 : 25;
  const historyPenalty = history.sample_count >= 3 && (history.completion_rate < 0.6 ||
    (history.average_interruptions ?? 0) >= 1.5) ? 5 : 0;
  const desiredBreak = state.availableMinutes >= 25 ? 5 : 0;
  const availableFocus = state.availableMinutes - warmup - desiredBreak;
  const focus = Math.max(1,Math.min(baseCap,typeCap,availableFocus) - historyPenalty);
  const breakMinutes = Math.min(desiredBreak,Math.max(0,state.availableMinutes - warmup - focus));
  const reason = state.startFriction === 'high' ? '先用 5 分钟做最小一步，再进入正式专注。' :
    state.energy === 'low' ? '当前精力较低，建议先完成一段较短的专注。' :
    historyPenalty ? '近期专注容易中断，先缩短目标以提高完成机会。' :
    '根据任务类型和可用时间，先完成一个清晰的小目标。';
  return validateFocusPlan({
    task_title: input.taskTitle.trim().slice(0,200) || '自由专注',
    subtasks: taskSteps[taskType], warmup_minutes:warmup, focus_minutes:focus,
    break_minutes:breakMinutes,
    recommended_environment: taskType === 'reading' || taskType === 'review' ? 'soft_noise' : 'quiet',
    recommendation_reason:reason,
  },state.availableMinutes);
}
export function recommendationDecision(original: FocusPlan, final: FocusPlan): 'accepted' | 'modified' {
  return JSON.stringify(original) === JSON.stringify(final) ? 'accepted' : 'modified';
}
