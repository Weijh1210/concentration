import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendationDecision, ruleFocusPlan, summarizeFocusHistory, validateFocusPlan,
  type FocusRecommendationInput } from '../src/domain/focusRecommendation';
const base: FocusRecommendationInput = {
  taskTitle:'完成英语阅读',taskNotes:'',taskType:'reading',
  state:{energy:'medium',startFriction:'high',availableMinutes:25},
  history:{sample_count:0,completion_rate:0,average_focus_minutes:0,average_perceived_focus:null,average_interruptions:null},
};
test('offline rule uses task type, state, available time and history', () => {
  const plan = ruleFocusPlan(base);
  assert.equal(plan.warmup_minutes,5);
  assert.equal(plan.recommended_environment,'soft_noise');
  assert.ok(plan.subtasks.length >= 1);
  assert.ok(plan.warmup_minutes+plan.focus_minutes+plan.break_minutes <=25);
  const disrupted = ruleFocusPlan({...base,history:{...base.history,sample_count:5,completion_rate:.4,average_interruptions:2}});
  assert.ok(disrupted.focus_minutes < plan.focus_minutes);
  const short = ruleFocusPlan({...base,state:{energy:'low',startFriction:'high',availableMinutes:5}});
  assert.equal(short.warmup_minutes,0); assert.equal(short.focus_minutes,5); assert.equal(short.break_minutes,0);
});
test('schema and business validation reject negative, overlong and extra fields', () => {
  const plan = ruleFocusPlan(base);
  assert.throws(()=>validateFocusPlan({...plan,focus_minutes:-1},25));
  assert.throws(()=>validateFocusPlan({...plan,focus_minutes:26},25));
  assert.throws(()=>validateFocusPlan({...plan,warmup_minutes:3},25));
  assert.throws(()=>validateFocusPlan({...plan,subtasks:[]},25));
  assert.throws(()=>validateFocusPlan({...plan,secret:'unexpected'},25));
  assert.throws(()=>validateFocusPlan({...plan,recommended_environment:'rain'},25));
  assert.equal(recommendationDecision(plan,plan),'accepted');
  assert.equal(recommendationDecision(plan,{...plan,focus_minutes:10}),'modified');
});
test('history summary uses only real finished sessions and feedback', () => {
  const session = {id:'a',status:'finished',startedAt:100,accumulatedStartMs:300000,accumulatedFocusMs:600000} as const;
  const result = summarizeFocusHistory([session as any,{...session,id:'b',status:'abandoned'} as any],
    [{sessionId:'a',perceivedFocus:4,interruptionCount:1} as any]);
  assert.equal(result.sample_count,2); assert.equal(result.completion_rate,.5);
  assert.equal(result.average_focus_minutes,10); assert.equal(result.average_perceived_focus,4);
});
