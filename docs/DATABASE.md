# Concentration 数据库设计（MVP）

> 已实现迁移：`supabase/migrations/20261011000100_initial.sql`、`20261011000200_focus_recommendations.sql`、`20261011000300_recommendation_plan_sync.sql`。本机 Supabase 已执行并通过 Auth、RLS 集成测试；尚未连接线上 Supabase 项目。SQLite 迁移见 `src/data/local/migrations.ts`。

## 关系与所有权

```text
auth.users 1—1 profiles
auth.users 1—N tasks, environments, focus_sessions, session_events, session_feedback, focus_recommendations, sync_operations, ai_recommendation_requests
tasks 0..1—N focus_sessions
environments 0..1—N focus_sessions
focus_sessions 1—N session_events
focus_sessions 1—0..1 session_feedback
focus_sessions 1—N focus_recommendations（可空，只有采用后关联）
```

所有私有表都有 `user_id uuid`，指向 `auth.users(id) on delete cascade`。`focus_sessions` 对 `tasks` / `environments`，以及 `session_events` / `session_feedback` 对 `focus_sessions` 使用 `(id, user_id)` 复合外键，阻止跨账号关联。所有私有表启用 RLS，只对 `authenticated` 角色开放所属行。匿名角色没有表权限或 policy。`sync_operations` 只由受控 RPC 写入。

## 表

| 表 | 主键 | 主要字段和约束 | 用途 |
| --- | --- | --- | --- |
| `profiles` | `user_id` | `display_name`、`timezone`、`revision` | Auth 注册触发器创建；用户偏好基础资料 |
| `tasks` | `id` | `title`、`notes`、`estimated_minutes`、`status`、`completed_at`、`deleted_at`、`revision` | 任务与软删除 tombstone |
| `environments` | `id` | `name`、`sound_key`、`deleted_at`、`revision` | 账号自定义环境预留；当前内置白噪音不需云端记录 |
| `focus_sessions` | `id` | `task_id`、`environment_id`、状态与阶段、开始/结束时间、累计毫秒、推荐输入与原因、`revision` | Focus Session 真正记录；每个账号至多一个未结束会话 |
| `session_events` | `id` | `session_id`、`event_type`、`occurred_at`、`payload` | 数据库触发器记录创建、暂停、恢复、阶段转换、结束；客户端只读 |
| `session_feedback` | `session_id` | `perceived_focus`、`interruption_count`、`note`、`revision` | 每个已完成会话最多一条反馈 |
| `focus_recommendations` | `id` | `input_json`、`plan_json`、`final_plan_json`、`source`、`fallback_reason`、`decision`、`session_id`、`session_status`、`actual_focus_ms`、`feedback_focus`、`revision` | 规则/AI 方案、用户决策、最终会话结果；复合外键约束任务与会话属于同一账号 |
| `ai_recommendation_requests` | `request_id` | `user_id`、`created_at` | 服务端模型请求去重与每账号限流；客户端无直接表权限 |
| `sync_operations` | `operation_id` | `entity_type`、`entity_id`、`result_revision` | RPC 的重复提交收据，仅服务端写入 |

时间列使用 `timestamptz`；时长使用非负整数毫秒。任务软删除保留历史关联。账号删除时 Auth 用户行级联删除上述所有数据。尚无 Supabase Storage 用户文件。

## 写入与冲突

移动端生成 UUID，先在 SQLite 保存业务行及 `sync_outbox` 操作，提交成功后刷新界面。登录用户联网时，按创建顺序调用 `apply_sync_change(operation_id, entity_type, payload, expected_revision)`。函数在单个事务中：

1. 校验 `auth.uid()` 与 payload 的 `user_id`，锁定操作 ID。
2. 若操作 ID 已成功执行，返回之前的版本号，不重复写入。
3. 新建要求 `expected_revision = 0`；修改使用原子条件 `revision = expected_revision`。数据库触发器递增版本。
4. 不匹配返回 SQLSTATE `40001`，移动端把操作标为冲突，保留本机数据；用户可选择以本机版本重试或采用云端版本。

网络失败保留 outbox 并指数退避；前台、联网恢复与定时检查再次同步。推送队列清空后拉取该账号的任务、会话和反馈（每页 500 条），本机从真实记录生成统计。当前数据量适合全量分页拉取；规模增长后应换成带 `(updated_at,id)` 游标的增量拉取。

推荐记录通过 `apply_recommendation_change` 使用同样的 UUID 收据和 revision 冲突规则；`plan_json` 与 `source` 更新会同步到云端。`reserve_ai_recommendation` 原子检查每账号 1 次/分钟、10 次/UTC 日和重复请求 ID。两个 RPC 都要求用户 JWT；推荐数据的读写仍受 RLS 限制。

## 本机 SQLite

版本 1 为游客业务表；版本 2 增加 `owner_scope`、`server_revision`、`sync_outbox` 和 `sync_cursors`；版本 3 增加推荐记录及其 outbox 类型。已有游客记录保持 `owner_scope='guest'`；登录账号使用 `user:<auth_uuid>`，不会混读。用户可在 Profile 明确选择导入游客记录。Auth 会话在 iOS/Android 的 SecureStore 保存。App 重开先加载本地分区，再尝试同步。

当前 `sync_cursors` 表已预留，但全量分页拉取尚未使用。SQLite 缓存未加密；设备级文件保护依赖操作系统。账号切换只切换作用域，退出登录不删除离线缓存；永久删除账号经服务端确认后清理该账号的本机缓存。

## 统计口径

只有 `finished` 会话进入完成次数与累计专注；时长为 `accumulated_start_ms + accumulated_focus_ms`。`abandoned` 留在历史但不计入完成。历史和统计不写入固定预填数字。
