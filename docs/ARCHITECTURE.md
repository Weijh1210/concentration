# Concentration 系统架构设计

> 状态：方案草案；2026-10-11。版本、依赖和平台行为应在初始化时按官方文档复核。

## 1. 技术方案

| 层 | 选择 | 职责 |
| --- | --- | --- |
| App | React Native + Expo + TypeScript + Expo Router | iOS/Android 页面、导航、原生能力适配 |
| UI 状态 | Zustand | 当前会话视图状态、临时表单、音频设置 |
| 服务端数据 | TanStack Query | 读取缓存、重新拉取和同步状态；不充当离线数据库 |
| 本地持久化 | Expo SQLite | 任务、会话、反馈、同步队列、用户设置 |
| 敏感本地数据 | SecureStore 或 Supabase 官方推荐的安全存储适配 | Token/敏感凭据；不存任务正文 |
| 云端 | Supabase Auth + PostgreSQL + RLS | 身份、用户数据与访问控制 |
| 服务端逻辑 | Supabase Edge Functions（需要时） | 未来的模型调用和敏感服务端逻辑 |
| 音频 | `expo-audio` | 本地白噪音播放与中断处理 |

MVP 的规则推荐放在纯 TypeScript domain 模块，保证离线可用、可测试。未来 AI 推荐通过 `RecommendationProvider` 接口替换，并由 Edge Function 保管模型密钥。不得把模型 API key 放进 `EXPO_PUBLIC_*`。

## 2. 数据与依赖方向

```text
Expo Router screens
    ↓
feature hooks / view models
    ↓
application use cases ──→ domain rules + focus state machine
    ↓
repositories (interfaces)
    ├── SQLite repository ──→ local tables + outbox
    └── Supabase sync adapter ──→ Auth / Postgres / RLS

audio / app-state / notification adapters → focus use cases
```

页面不得直接写 Supabase 表或操作计时细节。业务用例先提交 SQLite 事务，再安排异步同步；用户可立即看到本地结果。TanStack Query 负责云端读写流程和失效刷新，SQLite 是离线数据真值；Zustand 不保存唯一数据副本。

## 3. 计时器与状态机

持久化字段：`status`、`phase`、`phase_started_at`、`active_segment_started_at`、`accumulated_focus_ms`、`accumulated_start_ms`、`paused_at`、`planned_duration_ms`、`ended_at`。时间均为 UTC `timestamptz`/ISO 8601，时长为毫秒整数。

活动阶段显示时长：`accumulated_focus_ms + max(0, now - active_segment_started_at)`；暂停时只显示已累计值。进入暂停、换阶段、结束时，在同一 SQLite 事务中结算当前活动段并清空 `active_segment_started_at`。每秒刷新只更新显示，不增加持久化时长。

状态转换由纯函数校验：`ready → start_mode|focusing`；`start_mode → paused|focusing|abandoned`；`focusing → paused|awaiting_finish|finished|abandoned`；`paused → start_mode|focusing|finished|abandoned`；`awaiting_finish → focusing|finished`。非法转换返回显式错误。达到目标时按目标时间截断当前段并转为 `awaiting_finish`；用户选择继续后另起活动段，记录 `extended_ms`，防止后台返回时把超出的墙钟时间自动算成专注。

App 恢复时读取 SQLite 快照，用当前时间重新计算，并执行到时转换。系统后台任务不保证准时执行，因此它只能辅助同步或提醒，不能驱动计时。系统时钟跳变会影响跨重启的墙钟时间差：检测明显负值或异常大值后暂停并提示核对；真机测试需覆盖锁屏、强杀、重启和时间修改。

## 4. 本地优先同步

1. 本地每条记录使用客户端生成的 UUID、`owner_scope`（guest 或 user ID）、`updated_at`、`deleted_at`、`sync_state`。
2. 每次写入在 SQLite 事务中同时更新业务表和 `sync_outbox`。Outbox 包含 operation ID、entity type、entity ID、operation、payload、attempt count。
3. 登录后先完成游客数据导入确认，再按依赖顺序同步任务、会话、反馈。新增记录以 UUID 幂等插入；已有记录使用带 `expected_revision` 的条件更新，重复请求可安全重试但不能覆盖新版本。服务端 RLS 核实 `user_id = auth.uid()`。
4. 拉取增量以 `updated_at` 和稳定 ID 游标分页；软删除传播 tombstone。同步成功后再标记本地 operation 完成，不依赖网络请求恰好执行一次。
5. 任务字段冲突首版采用服务端修订版本 `revision` 的乐观并发检测：冲突时保留本地待处理副本并提示用户选择本机或云端。已结束会话视为不可变记录；反馈允许一次补填/修改并保留修订版本。不得静默覆盖。
6. 跨设备同时离线开始专注无法完全互斥。在线时用数据库唯一约束限制同一账号仅一个活动会话；离线冲突在同步时保留历史并要求用户处理，不丢弃记录。

账号退出后清除令牌并切换独立的本地 `owner_scope`；不得让下一个账号读到前一个账号的本地数据。游客导入过程应可重试，导入完成后才切换归属。

## 5. 安全与隐私

- Supabase `publishable key` 可用于客户端，但所有用户表必须开启 RLS；`service_role` 和模型 API key 只存在服务端环境。不要在日志记录 Token、任务正文或反馈备注。
- 数据库迁移由 `supabase/migrations/` 管理并纳入 Git；客户端和云端 schema 版本分别迁移。
- 云端写入验证所有枚举、长度和时长范围；RLS 限制读写自己的数据。必要服务端函数再加速率限制和请求校验。
- 开发、测试、生产环境分离；至少使用独立的开发 Supabase project。线上资源和付费服务必须在用户明确同意后创建。

## 6. 推荐的项目目录结构（初始化后）

```text
concentration/
├── app/                         # Expo Router routes，只负责页面组合
│   ├── (auth)/
│   ├── (tabs)/
│   ├── focus/
│   └── _layout.tsx
├── src/
│   ├── features/
│   │   ├── auth/
│   │   ├── tasks/
│   │   ├── recommendation/
│   │   ├── focus/
│   │   ├── feedback/
│   │   └── history/
│   ├── domain/                   # 纯规则、状态机、类型
│   ├── application/              # use cases、repository interfaces
│   ├── data/
│   │   ├── local/                # SQLite schema、migrations、repositories
│   │   ├── remote/               # Supabase adapter
│   │   └── sync/                 # outbox 与冲突处理
│   ├── platform/                 # audio、app-state、notifications
│   ├── components/               # 共享 UI
│   └── config/                   # 环境变量校验
├── assets/audio/                 # 已确认许可的本地音频
├── supabase/migrations/          # PostgreSQL + RLS migration
├── tests/                        # 业务规则、状态机、同步集成测试
├── docs/
├── .env.example
├── AGENTS.md
└── package.json
```

## 7. 技术风险与验证

| 风险 | 处理方式 |
| --- | --- |
| 后台任务与通知不准时 | 计时以持久化时间戳计算；通知只作提醒；真机验证 |
| 系统时间被修改 | 检测异常，暂停并请求用户核对；记录诊断信息但不虚构时长 |
| 离线并发与跨设备冲突 | outbox、UUID 幂等、revision 和冲突 UI；限制在线活动会话 |
| 游客转账号丢数据 | 显式确认、分批导入、可重试、导入前本地备份点 |
| 音频后台行为平台差异 | 先验证 iOS/Android 真机；必要时收窄首版后台音频承诺 |
| Supabase 免费额度、区域与可用性 | 初始化前确认地域和预算；保留本地优先体验 |

## 8. 参考资料

- [Expo BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/)：后台任务由系统调度，不能用作精确计时。
- [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/)：后台播放需要平台配置与真机验证。
- [Expo local storage guidance](https://docs.expo.dev/develop/user-interface/store-data/)：SQLite 与 SecureStore 的适用范围。
- [Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native)、[Supabase Expo quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native)：身份持久化、环境变量和 RLS。
