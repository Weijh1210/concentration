import { createClient } from 'npm:@supabase/supabase-js@2';
import { ruleFocusPlan, summarizeFocusHistory, type FocusRecommendationInput,
  type TaskType } from '../../../src/domain/focusRecommendation.ts';
import type { Energy, Friction, FocusSession, SessionFeedback, StateInput } from '../../../src/domain/types.ts';
import { requestStructuredFocusPlan, type ModelConfig } from './provider.ts';
const cors = { 'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS' };
const taskTypes: TaskType[] = ['study','reading','writing','practice','review','general'];
const energies: Energy[] = ['low','medium','high'];
const frictions: Friction[] = ['low','high'];
const available = [5,15,25,45,60];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validInput(value: unknown): value is {
  request_id:string; task_id:string|null; task_type:TaskType;
  energy:Energy; start_friction:Friction; available_minutes:StateInput['availableMinutes'];
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const x = value as Record<string,unknown>;
  return typeof x.request_id === 'string' && uuid.test(x.request_id) &&
    (x.task_id === null || (typeof x.task_id === 'string' && uuid.test(x.task_id))) &&
    taskTypes.includes(x.task_type as TaskType) && energies.includes(x.energy as Energy) &&
    frictions.includes(x.start_friction as Friction) && available.includes(x.available_minutes as number);
}
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
  if (request.method !== 'POST') return Response.json({error:'Method not allowed'},{status:405,headers:cors});
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const auth = request.headers.get('Authorization');
  if (!url || !anonKey) return Response.json({error:'Server not configured'},{status:500,headers:cors});
  if (!auth?.startsWith('Bearer ')) return Response.json({error:'Unauthorized'},{status:401,headers:cors});
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({error:'Invalid JSON'},{status:400,headers:cors}); }
  if (!validInput(body)) return Response.json({error:'Invalid recommendation input'},{status:400,headers:cors});
  const client = createClient(url,anonKey,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const { data: identity,error: authError } = await client.auth.getUser();
  if (authError || !identity.user) return Response.json({error:'Unauthorized'},{status:401,headers:cors});
  let title = '自由专注'; let notes = '';
  if (body.task_id) {
    const {data,error} = await client.from('tasks').select('title,notes').eq('id',body.task_id)
      .eq('user_id',identity.user.id).is('deleted_at',null).maybeSingle();
    if (error || !data) return Response.json({error:'Task not found'},{status:404,headers:cors});
    title = data.title; notes = data.notes;
  }
  const { data: recent,error: sessionError } = await client.from('focus_sessions')
    .select('id,status,started_at,accumulated_start_ms,accumulated_focus_ms')
    .eq('user_id',identity.user.id).in('status',['finished','abandoned'])
    .order('started_at',{ascending:false}).limit(10);
  if (sessionError) return Response.json({error:'History unavailable'},{status:503,headers:cors});
  const ids = (recent ?? []).map(row => row.id);
  const feedbackRows = ids.length ? await client.from('session_feedback')
    .select('session_id,perceived_focus,interruption_count').eq('user_id',identity.user.id).in('session_id',ids)
    : {data:[],error:null};
  if (feedbackRows.error) return Response.json({error:'History unavailable'},{status:503,headers:cors});
  const sessions: Pick<FocusSession,'id'|'status'|'startedAt'|'accumulatedStartMs'|'accumulatedFocusMs'>[] =
    (recent ?? []).map(row => ({id:row.id,status:row.status,startedAt:Date.parse(row.started_at),
      accumulatedStartMs:Number(row.accumulated_start_ms),accumulatedFocusMs:Number(row.accumulated_focus_ms)}));
  const feedback: Pick<SessionFeedback,'sessionId'|'perceivedFocus'|'interruptionCount'>[] =
    (feedbackRows.data ?? []).map(row => ({sessionId:row.session_id,perceivedFocus:row.perceived_focus,
      interruptionCount:row.interruption_count}));
  const input: FocusRecommendationInput = {
    taskTitle:title.slice(0,200),taskNotes:notes.slice(0,400),taskType:body.task_type,
    state:{energy:body.energy,startFriction:body.start_friction,availableMinutes:body.available_minutes},
    history:summarizeFocusHistory(sessions,feedback),
  };
  const baseline = ruleFocusPlan(input);
  const fallback = (reason:string) => Response.json({source:'rule',plan:baseline,fallback_reason:reason},{headers:cors});
  const key = Deno.env.get('AI_API_KEY'); const model = Deno.env.get('AI_MODEL');
  if (!key || !model) return fallback('not_configured');
  const provider = Deno.env.get('AI_PROVIDER') ?? 'openai';
  if (provider !== 'openai' && provider !== 'openai_compatible') return fallback('invalid_provider');
  const reserved = await client.rpc('reserve_ai_recommendation',{p_request_id:body.request_id});
  if (reserved.error) return fallback(reserved.error.message.includes('rate_limited') ? 'rate_limited' : 'budget_unavailable');
  if (!reserved.data) return fallback('duplicate_request');
  const config: ModelConfig = {
    provider,apiKey:key,model,
    baseUrl:Deno.env.get('AI_BASE_URL') ?? 'https://api.openai.com/v1',
    timeoutMs:Number(Deno.env.get('AI_TIMEOUT_MS') ?? '8000'),
    maxOutputTokens:Number(Deno.env.get('AI_MAX_OUTPUT_TOKENS') ?? '400'),
  };
  try {
    const plan = await requestStructuredFocusPlan(input,config);
    return Response.json({source:'ai',plan,fallback_reason:null},{headers:cors});
  } catch (error) {
    const reason = error instanceof Error && 'kind' in error ? String(error.kind) : 'provider';
    return fallback(reason);
  }
});
