export type Energy = 'low' | 'medium' | 'high';
export type Friction = 'low' | 'high';
export type TaskStatus = 'open' | 'completed';
export type SessionStatus = 'start_mode' | 'focusing' | 'paused' | 'awaiting_finish' | 'finished' | 'abandoned';
export type SessionPhase = 'start_mode' | 'focus';
export type EndReason = 'goal_reached' | 'user_ended' | 'interrupted';

export interface Task {
  id: string;
  title: string;
  notes: string;
  estimatedMinutes: number | null;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface StateInput {
  energy: Energy;
  startFriction: Friction;
  availableMinutes: 5 | 15 | 25 | 45 | 60;
}

export interface Recommendation {
  plannedMinutes: number;
  useStartMode: boolean;
  reasonCode: string;
  reason: string;
  ruleVersion: string;
}

export interface FocusSession {
  id: string;
  taskId: string | null;
  status: SessionStatus;
  phase: SessionPhase;
  startedAt: number;
  endedAt: number | null;
  activeSegmentStartedAt: number | null;
  pausedAt: number | null;
  accumulatedStartMs: number;
  accumulatedFocusMs: number;
  plannedDurationMs: number;
  extended: boolean;
  state: StateInput;
  recommendationReasonCode: string;
  recommendationRuleVersion: string;
  endReason: EndReason | null;
  clockWarning: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SessionFeedback {
  sessionId: string;
  perceivedFocus: number | null;
  interruptionCount: 0 | 1 | 2 | null;
  note: string;
  createdAt: number;
  updatedAt: number;
}
