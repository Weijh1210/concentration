# AI Focus Recommendation 设计

## 范围

本阶段实现一次性任务拆解与 Focus Session 建议。用户在 State 页面选任务类型、精力、启动难度和可用时间；推荐页立即显示离线规则方案，登录用户可主动请求一次 AI 方案。计时器的每秒刷新和会话状态更新不会调用模型。不提供 Agent 工具调用。

## 数据流

1. 从当前任务、状态和最近已完成会话与反馈构造最小化历史摘要；规则引擎在设备上生成基线方案。
2. 用户主动点击 AI 时，App 通过带用户 JWT 的 Supabase Edge Function 发起请求。服务端按 `auth.uid()` 限流并截断输入，调用配置的大模型服务商；API Key 只在 Edge Function 环境。
3. 模型使用严格 JSON Schema 返回 `task_title`、`subtasks`、`warmup_minutes`、`focus_minutes`、`break_minutes`、`recommended_environment`、`recommendation_reason`。服务端与客户端都检查结构、长度、整数、可用时间和 Start Mode 约束。拒绝、超时、429、5xx 或无效输出会回退到规则方案，并标明来源。
4. 推荐展示时写入本机 `focus_recommendations`；接受、修改或拒绝后更新决策。接受或修改时关联会话 UUID；结束后记录状态、实际时长和反馈。登录账号经 outbox 同步推荐记录。
5. 历史摘要只包含最近会话的数量、完成率、平均专注分钟数与反馈均值，不把原始任务历史上传模型。

## 约束与成本

- `warmup_minutes` 只能是 0 或 5；`focus_minutes` 为 1–60 整数；`break_minutes` 为 0–10 整数；三者总和不超过本次 `available_minutes`。
- 子任务 1–4 条，每条 1–100 字；任务标题 1–200 字；理由 1–300 字；环境只能是 `quiet` 或 `soft_noise`。
- 服务端每账号每分钟最多 1 次、每天最多 10 次 AI 请求；输入长度、历史摘要和模型输出 token 数均受限。相同 `request_id` 不重复调用模型。
- `AI_PROVIDER`、`AI_BASE_URL`、`AI_MODEL` 可在 Edge Function 环境替换支持 OpenAI Chat Completions Structured Outputs 的服务商。默认不会配置模型或密钥，因而不会产生外部模型调用。
- UI 优先显示可用的规则方案；AI 无凭据时不会伪装成已生成 AI 内容。

## 验证

规则、历史摘要、Schema 与业务约束、回退、决策和结果关联有自动化测试。本机 Supabase 集成测试覆盖 RLS 和请求限流。真实模型调用需要用户配置服务端 Key 后再验证，不以本机 mock 声称真实模型已通过。

## 配置真实模型

1. 在模型服务商创建 API Key，并选择支持 OpenAI Chat Completions `json_schema` / `strict` Structured Outputs 的模型。服务商和模型可能产生费用；先检查其价格与额度。不同服务商如果接口不兼容，需要在 `provider.ts` 增加适配器，不能只更换 URL。
2. 本机测试时复制 `supabase/functions/.env.example` 到 `supabase/functions/.env`，仅在后者填真实值。`AI_PROVIDER=openai`、`AI_BASE_URL=https://api.openai.com/v1` 是默认值；`AI_MODEL` 与 `AI_API_KEY` 必填。`AI_PROVIDER=openai_compatible` 可用于采用相同 Chat Completions 与 Structured Outputs 协议的服务商。`AI_TIMEOUT_MS` 最多按 20 秒处理；`AI_MAX_OUTPUT_TOKENS` 最多按 600 处理。
3. 重启本机 `supabase start` 和 `supabase functions serve`，以已登录用户从推荐页主动点击“让 AI 拆解这次任务”。显示“AI 为这次任务整理的建议”且记录的 `source=ai`，才说明实际模型响应通过了校验。可用 `focus_recommendations` 查询决策、会话状态和反馈关联；不要在日志输出 Key 或原始隐私内容。
4. 远端项目在 Supabase Dashboard → Edge Function Secrets 添加相同变量；部署 migration 与 `recommend-focus` Function 后用测试账号验证。不要在 `EXPO_PUBLIC_*`、Git、客户端或截图中放 Key。部署真实项目之前先核对目标项目与费用设置。

当前仓库未包含真实 API Key；自动化 provider 测试使用注入的模拟 HTTP 响应，本机 Edge 集成测试验证的是缺少 Key 时的回退，不代表真实模型调用已通过。
