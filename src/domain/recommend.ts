import type { Recommendation, StateInput } from './types';

export const AVAILABLE_MINUTES = [5, 15, 25, 45, 60] as const;

export function recommend(input: StateInput): Recommendation {
  const cap = input.energy === 'low' ? 15 : input.energy === 'medium' ? 25 : 45;
  const useStartMode = input.startFriction === 'high' && input.availableMinutes > 5;
  const plannedMinutes = Math.min(input.availableMinutes - (useStartMode ? 5 : 0), cap);
  const reasonCode = input.energy === 'low' ? 'LOW_ENERGY_SHORT' :
    useStartMode ? 'HIGH_FRICTION_START' : 'BALANCED_FOCUS';
  const reason = input.energy === 'low'
    ? '现在精力较低，先完成一段轻量专注。'
    : useStartMode
      ? '开始有点难，先用 5 分钟进入状态。'
      : '留出一段合适的时间，专心做眼前这一件事。';
  return { plannedMinutes, useStartMode, reasonCode, reason, ruleVersion: 'local-v1' };
}
