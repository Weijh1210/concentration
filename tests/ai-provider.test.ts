import assert from 'node:assert/strict';
import test from 'node:test';
import { requestStructuredFocusPlan, ModelRequestError } from '../supabase/functions/recommend-focus/provider';
import type { FocusRecommendationInput } from '../src/domain/focusRecommendation';
const input: FocusRecommendationInput = {
  taskTitle:'复习英语',taskNotes:'第 3 单元',taskType:'study',
  state:{energy:'medium',startFriction:'high',availableMinutes:25},
  history:{sample_count:2,completion_rate:.5,average_focus_minutes:15,average_perceived_focus:3,average_interruptions:1},
};
const config = {provider:'openai_compatible' as const,baseUrl:'https://example.test/v1',model:'test-model',
  apiKey:'test-only',timeoutMs:1000,maxOutputTokens:300};
const plan = {task_title:'复习英语',subtasks:['打开第 3 单元','完成一道练习'],warmup_minutes:5,
  focus_minutes:15,break_minutes:5,recommended_environment:'quiet',recommendation_reason:'先从一道题开始'};
test('provider sends strict Structured Outputs request and validates response', async () => {
  let request: Record<string,unknown> = {};
  const fetcher: typeof fetch = async (_url,options) => {
    request = JSON.parse(String(options?.body)) as Record<string,unknown>;
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(plan)}}]}),{status:200});
  };
  const result = await requestStructuredFocusPlan(input,config,fetcher);
  assert.equal(result.focus_minutes,15);
  assert.deepEqual((request?.response_format as {json_schema:{strict:boolean}}).json_schema.strict,true);
  assert.equal(request?.model,'test-model');
});
test('invalid model output, quota and timeout are explicit errors', async () => {
  const invalid: typeof fetch = async () => new Response(JSON.stringify({choices:[{finish_reason:'stop',
    message:{content:JSON.stringify({...plan,focus_minutes:-3})}}]}),{status:200});
  await assert.rejects(requestStructuredFocusPlan(input,config,invalid),(error:unknown) => error instanceof ModelRequestError && error.kind === 'invalid_output');
  const quota: typeof fetch = async () => new Response('{}',{status:429});
  await assert.rejects(requestStructuredFocusPlan(input,config,quota),(error:unknown) => error instanceof ModelRequestError && error.kind === 'quota');
  const timedOut: typeof fetch = async (_url,options) => new Promise((_resolve,reject) => {
    options?.signal?.addEventListener('abort',()=>reject(new Error('aborted')));
  });
  await assert.rejects(requestStructuredFocusPlan(input,{...config,timeoutMs:1},timedOut),
    (error:unknown) => error instanceof ModelRequestError && error.kind === 'timeout');
});
