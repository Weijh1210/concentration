import { totalFocusMs } from './session';
import type { FocusSession } from './types';

export interface GrowthStats {
  todayMs: number;
  weekMs: number;
  completedCount: number;
  streakDays: number;
  lastSevenDays: { date: string; focusMs: number }[];
}

function localDateKey(value: number): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayOffset(now: number, offset: number): string {
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - offset);
  return localDateKey(date.getTime());
}

export function calculateStats(sessions: FocusSession[], now: number): GrowthStats {
  const completed = sessions.filter((session) => session.status === 'finished' && totalFocusMs(session) > 0);
  const minutesByDay = new Map<string, number>();
  for (const session of completed) {
    const day = localDateKey(session.startedAt);
    minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + totalFocusMs(session));
  }
  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = dayOffset(now, 6 - index);
    return { date, focusMs: minutesByDay.get(date) ?? 0 };
  });
  let streakDays = 0;
  let offset = (minutesByDay.get(dayOffset(now, 0)) ?? 0) > 0 ? 0 : 1;
  while ((minutesByDay.get(dayOffset(now, offset)) ?? 0) > 0) {
    streakDays += 1;
    offset += 1;
  }
  return {
    todayMs: minutesByDay.get(dayOffset(now, 0)) ?? 0,
    weekMs: lastSevenDays.reduce((sum, day) => sum + day.focusMs, 0),
    completedCount: completed.length,
    streakDays,
    lastSevenDays,
  };
}
