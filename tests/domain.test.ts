import assert from 'node:assert/strict';
import test from 'node:test';
import { recommend } from '../src/domain/recommend';
import { calculateStats } from '../src/domain/stats';
import { continueAfterGoal, continueAfterStart, createSession, endSession, pauseSession, phaseElapsedMs, reconcileSession, resumeSession, START_MODE_MS } from '../src/domain/session';

const input = { energy: 'low', startFriction: 'high', availableMinutes: 45 } as const;
const plan = recommend(input);

test('recommendation responds to state and respects available time', () => {
  assert.equal(plan.plannedMinutes, 15);
  assert.equal(plan.useStartMode, true);
  assert.equal(recommend({ energy: 'high', startFriction: 'low', availableMinutes: 5 }).plannedMinutes, 5);
  assert.equal(recommend({ energy: 'high', startFriction: 'high', availableMinutes: 15 }).plannedMinutes, 10);
});

test('pause and resume exclude paused time', () => {
  const initial = createSession('one', null, input, plan, 1000);
  const paused = pauseSession(initial, 61_000);
  assert.equal(paused.accumulatedStartMs, 60_000);
  const resumed = resumeSession(paused, 600_000);
  assert.equal(phaseElapsedMs(resumed, 630_000), 90_000);
});

test('start mode and focus cap elapsed time after app resumes', () => {
  const initial = createSession('two', null, input, plan, 1000);
  const startDone = reconcileSession(initial, START_MODE_MS + 99_000);
  assert.equal(startDone.accumulatedStartMs, START_MODE_MS);
  assert.equal(startDone.activeSegmentStartedAt, null);
  const focusing = continueAfterStart(startDone, START_MODE_MS + 99_000);
  const due = reconcileSession(focusing, focusing.activeSegmentStartedAt! + 20 * 60_000);
  assert.equal(due.status, 'awaiting_finish');
  assert.equal(due.accumulatedFocusMs, 15 * 60_000);
  const extended = continueAfterGoal(due, due.updatedAt + 1);
  const done = endSession(extended, extended.updatedAt + 60_000, 'goal_reached');
  assert.equal(done.accumulatedFocusMs, 16 * 60_000);
});

test('clock rollback pauses safely', () => {
  const initial = createSession('three', null, input, plan, 1000);
  const repaired = reconcileSession(initial, 500);
  assert.equal(repaired.status, 'paused');
  assert.equal(repaired.clockWarning, true);
});

test('statistics only include finished sessions with actual time', () => {
  const now = new Date(2026, 9, 11, 12).getTime();
  const finished = endSession(createSession('four', null, input, { ...plan, useStartMode: false }, now - 60_000), now, 'user_ended');
  const abandoned = endSession(createSession('five', null, input, plan, now), now, 'user_ended');
  const stats = calculateStats([finished, abandoned], now);
  assert.equal(stats.todayMs, 60_000);
  assert.equal(stats.completedCount, 1);
  assert.equal(stats.streakDays, 1);
});
