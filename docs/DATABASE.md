# Concentration 数据库设计（MVP）

> 状态：逻辑 schema 草案；尚未生成或执行 migration。字段名使用英文，解释使用中文。

## 1. 设计约定

- 云端为 Supabase PostgreSQL；本地为 Expo SQLite。业务实体使用客户端生成的 UUID，便于离线创建和幂等同步。
- 云端所有用户数据表均有 `user_id uuid not null`，引用 `auth.users(id)`；启用 RLS 并限制 `auth.uid() = user_id`。
- `created_at`、`updated_at`、`deleted_at` 为 UTC 时间戳。`updated_at` 由数据库触发器更新；`revision bigint` 由数据库在成功更新时递增。
- 删除任务采用 `deleted_at` 软删除，以保留历史关联。会话原则上不删除，账号删除时按数据删除流程清除。
- 统计是查询结果，不存可被误认为真实数据的预填聚合表。所有时长使用非负整数毫秒。

## 2. 关系

```text
auth.users 1 ── 1 profiles
auth.users 1 ── N tasks
auth.users 1 ── N focus_sessions
tasks      1 ── N focus_sessions (task_id 可为空)
focus_sessions 1 ── 0..1 session_feedback
```

## 3. 云端表

### `profiles`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | `uuid primary key references auth.users(id) on delete cascade` | 所有者 |
| `display_name` | `text null` | 展示名称，限制长度 |
| `timezone` | `text not null` | IANA 时区，默认按客户端首次设置；统计日界线使用它 |
| `created_at` | `timestamptz not null` | 创建时间 |
| `updated_at` | `timestamptz not null` | 更新时间 |
| `revision` | `bigint not null default 1` | 并发控制 |

### `tasks`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 客户端生成 |
| `user_id` | `uuid not null references auth.users(id) on delete cascade` | 所有者 |
| `title` | `text not null` | 非空，建议最大 200 字符 |
| `notes` | `text null` | 建议最大 2000 字符 |
| `estimated_minutes` | `smallint null` | 5–240 |
| `status` | `text not null` | `open` / `completed` |
| `completed_at` | `timestamptz null` | 完成时间，重新打开时清空 |
| `created_at` | `timestamptz not null` | 创建时间 |
| `updated_at` | `timestamptz not null` | 更新时间 |
| `deleted_at` | `timestamptz null` | 软删除 tombstone |
| `revision` | `bigint not null default 1` | 并发控制 |

约束：`length(trim(title)) > 0`；`status` 和 `completed_at` 一致；`estimated_minutes` 范围检查。索引：`(user_id, status, updated_at desc)`、`(user_id, deleted_at)`。

### `focus_sessions`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 客户端生成 |
| `user_id` | `uuid not null references auth.users(id) on delete cascade` | 所有者 |
| `task_id` | `uuid null references tasks(id) on delete set null` | 可不关联任务；写入时必须验证任务归属 |
| `status` | `text not null` | `ready` / `start_mode` / `focusing` / `paused` / `awaiting_finish` / `finished` / `abandoned` |
| `phase` | `text not null` | `start_mode` / `focus`；暂停时仍保留原阶段 |
| `phase_started_at` | `timestamptz null` | 当前阶段首次开始时间 |
| `active_segment_started_at` | `timestamptz null` | 当前未暂停活动段开始时间 |
| `paused_at` | `timestamptz null` | 最近暂停时间 |
| `started_at` | `timestamptz null` | 首次开始时间 |
| `ended_at` | `timestamptz null` | 最终结束时间 |
| `planned_duration_ms` | `integer not null` | 正式阶段目标时长 |
| `accumulated_start_ms` | `bigint not null default 0` | 已结算启动阶段时长 |
| `accumulated_focus_ms` | `bigint not null default 0` | 已结算正式阶段时长 |
| `extended_ms` | `bigint not null default 0` | 到时后用户主动继续的时长，包含在正式阶段累计时长中 |
| `energy` | `text not null` | `low` / `medium` / `high` |
| `start_friction` | `text not null` | `low` / `high` |
| `available_minutes` | `smallint not null` | 用户所选可用时长 |
| `recommendation_reason_code` | `text not null` | 推荐原因代码 |
| `recommendation_rule_version` | `text not null` | 推荐规则版本 |
| `end_reason` | `text null` | `goal_reached` / `user_ended` / `interrupted` |
| `created_at` | `timestamptz not null` | 创建时间 |
| `updated_at` | `timestamptz not null` | 更新时间 |
| `revision` | `bigint not null default 1` | 并发控制 |

约束：枚举值、时间顺序、非负时长、计划时长范围都由 `CHECK` 限制。`finished`/`abandoned` 必须有 `ended_at`，活动状态不得有 `ended_at`；`active_segment_started_at` 只允许在 `start_mode`/`focusing`。账号在线时用部分唯一索引限制一个未结束会话（`status in ('ready','start_mode','focusing','paused','awaiting_finish')`）。索引：`(user_id, started_at desc)`、`(user_id, status)`。

任务归属需在数据库 trigger 或受控写入函数中验证 `tasks.user_id = focus_sessions.user_id`，单靠 FK 不足以防止跨用户关联。若选择复合 FK，需为 `tasks(id, user_id)` 增加唯一约束。

### `session_feedback`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `session_id` | `uuid primary key references focus_sessions(id) on delete cascade` | 一次会话最多一条反馈 |
| `user_id` | `uuid not null references auth.users(id) on delete cascade` | 所有者 |
| `perceived_focus` | `smallint null` | 1–5 |
| `interruption_count` | `smallint null` | 0/1/2，其中 2 表示 2+ |
| `note` | `text null` | 建议最大 500 字符 |
| `created_at` | `timestamptz not null` | 创建时间 |
| `updated_at` | `timestamptz not null` | 更新时间 |
| `revision` | `bigint not null default 1` | 并发控制 |

约束：至少填写一个反馈字段；反馈仅可关联已结束且同属该用户的会话，通过 trigger 或受控写入函数验证。

## 4. RLS 原则

每张 `public` 用户表启用 RLS。`SELECT`、`INSERT`、`UPDATE`、`DELETE` 均只允许 `auth.uid() = user_id`；`INSERT`/`UPDATE` 同时使用 `WITH CHECK`。`profiles.user_id` 不允许被更新。客户端不能写入任意用户的记录。`service_role` 不下发到 App。迁移中应覆盖 RLS 与跨用户关联测试。

`revision` 冲突需要原子化检查：建议用受控 PostgreSQL RPC 或条件更新语句提交 `expected_revision`，影响行数为 0 时返回冲突。不能先读取 revision 再无条件 `upsert`，否则会覆盖他端修改。

## 5. 本地 SQLite

本地业务表镜像上述字段，另加 `owner_scope text`、`sync_state`（`local_only` / `pending` / `synced` / `conflict`）、`server_revision`。游客 `owner_scope = guest:<installation_uuid>`，登录账号 `owner_scope = user:<auth_uuid>`。本地外键开启 `PRAGMA foreign_keys = ON`。

额外表：

| 表 | 关键字段 | 用途 |
| --- | --- | --- |
| `sync_outbox` | `operation_id uuid primary key`, `owner_scope`, `entity_type`, `entity_id`, `operation`, `payload_json`, `attempt_count`, `created_at`, `next_retry_at` | 离线写入队列、重试和幂等 |
| `sync_cursors` | `owner_scope primary key`, `last_updated_at`, `last_id` | 增量拉取游标 |
| `app_settings` | `owner_scope`, `key`, `value_json` | 音量、主题、时区等本机设置 |
| `schema_migrations` | `version primary key`, `applied_at` | 本地 schema 升级 |

本地游客数据只存在设备内；清除 App 数据或卸载可能永久丢失。游客转账号导入完成前不得删除本地原件。

## 6. 数据计算口径

- `actual_focus_ms = accumulated_start_ms + accumulated_focus_ms`；仅 `finished` 会话计入完成统计。`abandoned` 在历史中显示但不计入完成次数和专注总时长，产品若调整需统一修改。
- 日统计按 `profiles.timezone` 中 `started_at` 的本地日期归属；跨午夜会话暂归开始日。时区变更后历史按当前时区重算，需在界面说明。
- 连续专注天数：从今天或昨天往前数，存在至少一条 `finished` 且 `actual_focus_ms > 0` 的日期数。

## 7. Migration 顺序

1. 公共枚举约束、`updated_at`/`revision` trigger。
2. `profiles`、`tasks`、`focus_sessions`、`session_feedback` 和索引。
3. RLS policies、跨用户关联校验和并发写入 RPC。
4. 回归测试：跨用户读取/写入被拒、重复 UUID 幂等、revision 冲突、软删除传播。
