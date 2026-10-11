import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const url = process.env.LOCAL_SUPABASE_URL!;
const key = process.env.LOCAL_SUPABASE_KEY!;
const adminKey = process.env.LOCAL_SUPABASE_ADMIN_KEY!;
if (!url?.startsWith('http://127.0.0.1:54421') || !key || !adminKey) throw new Error('Local Supabase test env required');
const client = () => createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
const admin = createClient(url,adminKey,{auth:{autoRefreshToken:false,persistSession:false}});
async function createTestUser() {
  const account = client();
  const email = `concentration-${randomUUID()}@example.test`;
  const password = 'Concentration-test-9372';
  const signup = await account.auth.signUp({email,password});
  assert.equal(signup.error,null); assert.ok(signup.data.user?.id);
  // Local-only admin confirms the email; the mobile app never receives this key.
  const confirmed = await admin.auth.admin.updateUserById(signup.data.user!.id,{email_confirm:true});
  assert.equal(confirmed.error,null);
  const login = await account.auth.signInWithPassword({email,password});
  assert.equal(login.error,null); assert.ok(login.data.session);
  return {account,id:signup.data.user!.id};
}
async function apply(account: ReturnType<typeof client>, type:string, payload:Record<string,unknown>, revision:number, operationId=randomUUID()) {
  return account.rpc('apply_sync_change',{p_operation_id:operationId,p_entity_type:type,p_payload:payload,p_expected_revision:revision});
}
test('local Auth, task/session/feedback, history, idempotency, RLS and logout', async () => {
  const a = await createTestUser();
  const b = await createTestUser();
  try {
    const taskId = randomUUID(); const sessionId = randomUUID(); const now = Date.now();
    const task = {id:taskId,user_id:a.id,title:'真实任务',notes:'',estimated_minutes:25,status:'open',completed_at:null,
      created_at:new Date(now).toISOString(),deleted_at:null};
    const op = randomUUID();
    const first = await apply(a.account,'task',task,0,op);
    assert.equal(first.error,null); assert.equal(first.data,1);
    const duplicate = await apply(a.account,'task',task,0,op);
    assert.equal(duplicate.error,null); assert.equal(duplicate.data,1);
    const updated = await apply(a.account,'task',{...task,title:'已编辑任务'},1);
    assert.equal(updated.error,null); assert.equal(updated.data,2);
    const stale = await apply(a.account,'task',{...task,title:'过期版本'},1);
    assert.equal(stale.error?.code,'40001');
    const session = {id:sessionId,user_id:a.id,task_id:taskId,environment_id:null,status:'focusing',phase:'focus',
      started_at:new Date(now).toISOString(),ended_at:null,active_segment_started_at:new Date(now).toISOString(),
      paused_at:null,accumulated_start_ms:0,accumulated_focus_ms:0,planned_duration_ms:300000,
      extended:false,energy:'medium',start_friction:'low',available_minutes:15,
      recommendation_reason_code:'test',recommendation_rule_version:'1',end_reason:null,clock_warning:false,
      created_at:new Date(now).toISOString()};
    const started = await apply(a.account,'session',session,0);
    assert.equal(started.error,null); assert.equal(started.data,1);
    const finished = await apply(a.account,'session',{...session,status:'finished',ended_at:new Date(now+60000).toISOString(),
      active_segment_started_at:null,accumulated_focus_ms:60000,end_reason:'user_ended'},1);
    assert.equal(finished.error,null); assert.equal(finished.data,2);
    const feedback = await apply(a.account,'feedback',{session_id:sessionId,user_id:a.id,
      perceived_focus:4,interruption_count:0,note:'完成',created_at:new Date(now+60000).toISOString()},0);
    assert.equal(feedback.error,null); assert.equal(feedback.data,1);
    const history = await a.account.from('focus_sessions').select('id,status').eq('id',sessionId);
    assert.equal(history.error,null); assert.equal(history.data?.[0]?.status,'finished');
    const events = await a.account.from('session_events').select('event_type').eq('session_id',sessionId);
    assert.equal(events.error,null); assert.deepEqual(events.data?.map(x=>x.event_type),['created','finished']);
    const environmentId = randomUUID();
    const environment = await a.account.from('environments').insert({id:environmentId,user_id:a.id,name:'我的环境',sound_key:'soft_noise'});
    assert.equal(environment.error,null);
    for (const [table,key,value] of [
      ['profiles','user_id',a.id],['tasks','id',taskId],['environments','id',environmentId],
      ['focus_sessions','id',sessionId],['session_events','session_id',sessionId],
      ['session_feedback','session_id',sessionId],['sync_operations','entity_id',taskId],
    ] as const) {
      const invisible = await b.account.from(table).select('*').eq(key,value);
      // sync_operations has no SELECT grant; all other tables return an empty RLS result.
      assert.ok(invisible.error || invisible.data?.length === 0, `${table} leaked another user's row`);
    }
    const wrongOwner = await apply(b.account,'task',{...task,title:'偷改'},2);
    assert.equal(wrongOwner.error?.code,'42501');
    const crossReference = await apply(b.account,'session',{...session,id:randomUUID(),user_id:b.id},0);
    assert.ok(crossReference.error);
    const forgedReceipt = await b.account.from('sync_operations').insert({operation_id:randomUUID(),user_id:b.id,entity_type:'task',entity_id:taskId,result_revision:99});
    assert.ok(forgedReceipt.error);
    const forgedEvent = await b.account.from('session_events').insert({id:randomUUID(),user_id:b.id,session_id:sessionId,event_type:'finished',occurred_at:new Date().toISOString()});
    assert.ok(forgedEvent.error);
    const logout = await a.account.auth.signOut(); assert.equal(logout.error,null);
    const afterLogout = await a.account.from('tasks').select('id').eq('id',taskId);
    assert.ok(!afterLogout.data || afterLogout.data.length === 0);
  } finally {
    await admin.auth.admin.deleteUser(a.id);
    await admin.auth.admin.deleteUser(b.id);
  }
});
test('delete-account function removes auth user and cascades private rows', async () => {
  const user = await createTestUser();
  const id = randomUUID();
  const task = {id,user_id:user.id,title:'删除测试',notes:'',estimated_minutes:null,status:'open',completed_at:null,
    created_at:new Date().toISOString(),deleted_at:null};
  try {
    const written = await apply(user.account,'task',task,0);
    assert.equal(written.error,null);
    const sessionId = randomUUID();
    const now = Date.now();
    const session = {id:sessionId,user_id:user.id,task_id:id,environment_id:null,status:'finished',phase:'focus',
      started_at:new Date(now-60000).toISOString(),ended_at:new Date(now).toISOString(),
      active_segment_started_at:null,paused_at:null,accumulated_start_ms:0,accumulated_focus_ms:60000,
      planned_duration_ms:300000,extended:false,energy:'medium',start_friction:'low',available_minutes:15,
      recommendation_reason_code:'test',recommendation_rule_version:'1',end_reason:'user_ended',clock_warning:false,
      created_at:new Date(now-60000).toISOString()};
    assert.equal((await apply(user.account,'session',session,0)).error,null);
    assert.equal((await apply(user.account,'feedback',{session_id:sessionId,user_id:user.id,perceived_focus:4,
      interruption_count:0,note:'',created_at:new Date().toISOString()},0)).error,null);
    const deleted = await user.account.functions.invoke('delete-account',{method:'POST'});
    assert.equal(deleted.error,null);
    assert.deepEqual(deleted.data,{deleted:true});
    const auth = await admin.auth.admin.getUserById(user.id);
    assert.ok(auth.error);
    const rows = await admin.from('tasks').select('id').eq('id',id);
    assert.equal(rows.error,null); assert.equal(rows.data?.length,0);
    for (const [table,key] of [['focus_sessions','id'],['session_events','session_id'],['session_feedback','session_id']] as const) {
      const result = await admin.from(table).select(key).eq(key,sessionId);
      assert.equal(result.error,null); assert.equal(result.data?.length,0);
    }
  } finally { await admin.auth.admin.deleteUser(user.id); }
});
test('AI recommendation fallback, decision persistence, per-user quota and RLS', async () => {
  const a = await createTestUser(); const b = await createTestUser();
  try {
    const taskId = randomUUID(); const now = Date.now();
    const task = {id:taskId,user_id:a.id,title:'英语阅读练习',notes:'第三单元',estimated_minutes:25,status:'open',
      completed_at:null,created_at:new Date(now).toISOString(),deleted_at:null};
    assert.equal((await apply(a.account,'task',task,0)).error,null);
    const body = {request_id:randomUUID(),task_id:taskId,task_type:'reading',energy:'medium',
      start_friction:'high',available_minutes:25};
    const functionResult = await a.account.functions.invoke('recommend-focus',{body});
    assert.equal(functionResult.error,null);
    assert.equal(functionResult.data.source,'rule');
    assert.equal(functionResult.data.fallback_reason,'not_configured');
    const plan = functionResult.data.plan;
    assert.ok(plan.warmup_minutes + plan.focus_minutes + plan.break_minutes <=25);
    const foreignTask = await b.account.functions.invoke('recommend-focus',{body:{...body,request_id:randomUUID()}});
    assert.ok(foreignTask.error);
    const recId = randomUUID();
    const input = {taskTitle:task.title,taskNotes:task.notes,taskType:'reading',
      state:{energy:'medium',startFriction:'high',availableMinutes:25},
      history:{sample_count:0,completion_rate:0,average_focus_minutes:0,
        average_perceived_focus:null,average_interruptions:null}};
    const payload = {id:recId,user_id:a.id,task_id:taskId,task_type:'reading',input_json:input,
      plan_json:plan,final_plan_json:null,source:'rule',fallback_reason:'not_configured',decision:'pending',
      session_id:null,session_status:null,actual_focus_ms:null,feedback_focus:null,created_at:new Date(now).toISOString()};
    const inserted = await a.account.rpc('apply_recommendation_change',{
      p_operation_id:randomUUID(),p_payload:payload,p_expected_revision:0});
    assert.equal(inserted.error,null); assert.equal(inserted.data,1);
    const aiPlan = {...plan,focus_minutes:Math.max(1,plan.focus_minutes-1)};
    const generated = await a.account.rpc('apply_recommendation_change',{
      p_operation_id:randomUUID(),p_payload:{...payload,plan_json:aiPlan,source:'ai',fallback_reason:null},
      p_expected_revision:1});
    assert.equal(generated.error,null); assert.equal(generated.data,2);
    const persisted = await a.account.from('focus_recommendations').select('plan_json,source,fallback_reason').eq('id',recId).single();
    assert.equal(persisted.error,null); assert.equal(persisted.data?.source,'ai');
    assert.equal(persisted.data?.plan_json.focus_minutes,aiPlan.focus_minutes);
    const rejected = await a.account.rpc('apply_recommendation_change',{
      p_operation_id:randomUUID(),p_payload:{...payload,plan_json:aiPlan,source:'ai',fallback_reason:null,
        decision:'rejected'},p_expected_revision:2});
    assert.equal(rejected.error,null); assert.equal(rejected.data,3);
    const sessionId = randomUUID();
    const session = {id:sessionId,user_id:a.id,task_id:taskId,environment_id:null,status:'focusing',phase:'focus',
      started_at:new Date(now).toISOString(),ended_at:null,active_segment_started_at:new Date(now).toISOString(),
      paused_at:null,accumulated_start_ms:0,accumulated_focus_ms:0,planned_duration_ms:900000,
      extended:false,energy:'medium',start_friction:'high',available_minutes:25,
      recommendation_reason_code:'AI_FOCUS_V1',recommendation_rule_version:'ai-v1',end_reason:null,
      clock_warning:false,created_at:new Date(now).toISOString()};
    assert.equal((await apply(a.account,'session',session,0)).error,null);
    const acceptedId = randomUUID();
    const accepted = await a.account.rpc('apply_recommendation_change',{
      p_operation_id:randomUUID(),p_payload:{...payload,id:acceptedId,plan_json:aiPlan,source:'ai',
        fallback_reason:null,final_plan_json:aiPlan,decision:'accepted',session_id:sessionId,
        session_status:'focusing'},p_expected_revision:0});
    assert.equal(accepted.error,null);
    assert.equal((await apply(a.account,'session',{...session,status:'finished',
      ended_at:new Date(now+60000).toISOString(),active_segment_started_at:null,
      accumulated_focus_ms:60000,end_reason:'user_ended'},1)).error,null);
    assert.equal((await apply(a.account,'feedback',{session_id:sessionId,user_id:a.id,
      perceived_focus:4,interruption_count:0,note:'已完成',created_at:new Date(now+60000).toISOString()},0)).error,null);
    const outcome = await a.account.rpc('apply_recommendation_change',{
      p_operation_id:randomUUID(),p_payload:{...payload,id:acceptedId,plan_json:aiPlan,source:'ai',
        fallback_reason:null,final_plan_json:aiPlan,decision:'accepted',session_id:sessionId,
        session_status:'finished',actual_focus_ms:60000,feedback_focus:4},p_expected_revision:1});
    assert.equal(outcome.error,null);
    const outcomeRow = await a.account.from('focus_recommendations')
      .select('decision,session_status,actual_focus_ms,feedback_focus').eq('id',acceptedId).single();
    assert.equal(outcomeRow.error,null);
    assert.equal(outcomeRow.data?.session_status,'finished');
    assert.equal(outcomeRow.data?.actual_focus_ms,60000);
    assert.equal(outcomeRow.data?.feedback_focus,4);
    const hidden = await b.account.from('focus_recommendations').select('id').eq('id',recId);
    assert.equal(hidden.error,null); assert.equal(hidden.data?.length,0);
    const first = await a.account.rpc('reserve_ai_recommendation',{p_request_id:randomUUID()});
    assert.equal(first.error,null); assert.equal(first.data,true);
    const limited = await a.account.rpc('reserve_ai_recommendation',{p_request_id:randomUUID()});
    assert.equal(limited.error?.message,'rate_limited');
  } finally { await admin.auth.admin.deleteUser(a.id); await admin.auth.admin.deleteUser(b.id); }
});
