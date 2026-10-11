import { FOCUS_PLAN_JSON_SCHEMA, validateFocusPlan,
  type FocusPlan, type FocusRecommendationInput } from '../../../src/domain/focusRecommendation.ts';

export interface ModelConfig {
  provider: 'openai' | 'openai_compatible';
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  maxOutputTokens: number;
  allowLocalHttp?: boolean;
}
export class ModelRequestError extends Error {
  constructor(readonly kind: 'config' | 'timeout' | 'quota' | 'provider' | 'invalid_output', message: string) {
    super(message);
  }
}
export async function requestStructuredFocusPlan(input: FocusRecommendationInput, config: ModelConfig,
  fetcher: typeof fetch = fetch): Promise<FocusPlan> {
  if (!['openai','openai_compatible'].includes(config.provider) || !config.apiKey || !config.model)
    throw new ModelRequestError('config','AI provider is not configured');
  let endpoint: URL;
  try {
    const base = new URL(config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`);
    if (base.protocol !== 'https:' && !(config.allowLocalHttp && base.protocol === 'http:' &&
      ['localhost','127.0.0.1'].includes(base.hostname))) throw new Error('HTTPS required');
    endpoint = new URL('chat/completions',base);
  } catch { throw new ModelRequestError('config','Invalid AI endpoint'); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(),Math.max(1000,Math.min(config.timeoutMs,20000)));
  try {
    const response = await fetcher(endpoint,{
      method:'POST',signal:controller.signal,
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},
      body:JSON.stringify({
        model:config.model,max_completion_tokens:Math.max(100,Math.min(config.maxOutputTokens,600)),
        messages:[
          {role:'system',content:'你是专注规划助手。只针对这次任务给出可执行的小步骤和保守的时间建议。不要调用工具。必须遵守可用时间。'},
          {role:'user',content:JSON.stringify({
            task_title:input.taskTitle.slice(0,200),task_notes:input.taskNotes.slice(0,400),
            task_type:input.taskType,state:input.state,history:input.history,
            constraints:'warmup 只能 0 或 5；各时长为非负整数；warmup+focus+break 不超过 availableMinutes；subtasks 1-4 条。',
          })},
        ],
        response_format:{type:'json_schema',json_schema:{name:'focus_plan',strict:true,schema:FOCUS_PLAN_JSON_SCHEMA}},
      }),
    });
    if (response.status === 429 || response.status === 402) throw new ModelRequestError('quota','AI quota exceeded');
    if (!response.ok) throw new ModelRequestError('provider',`AI provider HTTP ${response.status}`);
    const body = await response.json() as {choices?:{finish_reason?:string;message?:{content?:string;refusal?:string}}[]};
    const choice = body.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason !== 'stop' || typeof choice?.message?.content !== 'string')
      throw new ModelRequestError('invalid_output','AI did not return a complete structured response');
    let parsed: unknown;
    try { parsed = JSON.parse(choice.message.content); }
    catch { throw new ModelRequestError('invalid_output','AI returned invalid JSON'); }
    try { return validateFocusPlan(parsed,input.state.availableMinutes); }
    catch { throw new ModelRequestError('invalid_output','AI recommendation violated business rules'); }
  } catch (error) {
    if (controller.signal.aborted) throw new ModelRequestError('timeout','AI request timed out');
    if (error instanceof ModelRequestError) throw error;
    throw new ModelRequestError('provider','AI provider request failed');
  } finally { clearTimeout(timer); }
}
