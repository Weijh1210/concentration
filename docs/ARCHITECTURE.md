# Concentration 系统架构设计

> 状态：本地优先 MVP 已实现；本机 Supabase 通过集成测试，线上项目尚未配置。实际数据细节见 [DATABASE.md](DATABASE.md)。

## 1. 技术方案

| 层 | 选择 | 职责 |
| --- | --- | --- |
| App | React Native + Expo + TypeScript + Expo Router | iOS/Android 页面、导航、原生能力适配 |
| UI 状态 | Zustand | 当前会话视图状态、临时表单、音频设置 |
| 同步调度 | Zustand action + `src/data/sync` | 前台、联网恢复、定时重试；目前未引入 TanStack Query |
| 本地持久化 | Expo SQLite | 任务、会话、反馈、同步队列、用户设置 |
| 敏感本地数据 | SecureStore 或 Supabase 官方推荐的安全存储适配 | Token/敏感凭据；不存任务正文 |
| 云端 | Supabase Auth + PostgreSQL + RLS | 身份、用户数据与访问控制 |
| 服务端逻辑 | Supabase Edge Functions（需要时） | 未来的模型调用和敏感服务端逻辑 |
| 音频 | `expo-audio` | 本地白噪音播放与中断处理 |

MVP 的规则推荐放在纯 TypeScript domain 模块，保证离线可用、可测试。AI 推荐通过 Edge Function 的可配置 OpenAI-compatible provider 调用；模型密钥只存在服务端。不得把模型 API key 放进 `EXPO_PUBLIC_*`。

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

页面不得直接写 Supabase 表或操作计时细节。业务用例先提交 SQLite 事务，再安排异步同步；用户可立即看到本地结果。当前由 `syncOnce` 负责云端推送与分页拉取，SQLite 是离线数据真值；Zustand 是界面快照，不保存唯一数据副本。

## 3. 计时器与状态机

持久化字段：`status`、`phase`、`active_segment_started_at`、`accumulated_focus_ms`、`accumulated_start_ms`、`paused_at`、`planned_duration_ms`、`ended_at`。时间均为 UTC `timestamptz`/ISO 8601，时长为毫秒整数。

活动阶段显示时长：`accumulated_focus_ms + max(0, now - active_segment_started_at)`；暂停时只显示已累计值。进入暂停、换阶段、结束时，在同一 SQLite 事务中结算当前活动段并清空 `active_segment_started_at`。每秒刷新只更新显示，不增加持久化时长。

状态转换由纯函数校验：`create → start_mode|focusing`；`start_mode → paused|focusing|abandoned`；`focusing → paused|awaiting_finish|finished|abandoned`；`paused → start_mode|focusing|finished|abandoned`；`awaiting_finish → focusing|finished`。非法转换返回显式错误。达到目标时按目标时间截断当前段并转为 `awaiting_finish`；用户选择继续后另起活动段，记录 `extended` 标志与累计正式专注时长，防止后台返回时把超出的墙钟时间自动算成专注。

App 恢复时读取 SQLite 快照，用当前时间重新计算，并执行到时转换。系统后台任务不保证准时执行，因此它只能辅助同步或提醒，不能驱动计时。系统时钟跳变会影响跨重启的墙钟时间差：检测明显负值或异常大值后暂停并提示核对；真机测试需覆盖锁屏、强杀、重启和时间修改。

## 4. 本地优先同步

1. 本地记录使用客户端 UUID、`owner_scope`、`server_revision`；游客 `guest`，登录账号 `user:<auth_uuid>`。
2. 写入在 SQLite 事务中同时更新业务行与 outbox。每条操作有独立 UUID、payload、预期 revision 和重试状态。
3. 登录后用户可手动导入游客数据。同步按 outbox 顺序推送，数据库 `apply_sync_change` 在事务中校验归属、版本并保存操作收据；重复提交返回之前的结果。
4. 网络失败指数退避；前台、网络恢复、30 秒定时器重新尝试。推送队列清空后按稳定排序全量分页拉取账号的任务、会话和反馈，跳过本机仍待处理的记录。`sync_cursors` 为未来增量同步预留。
5. 冲突保留本机改动并停止后续依赖写入。Profile 提供保留本机版本（以当前云端 revision 重试）与使用云端版本两个选择。尚无字段级合并。
6. 在线数据库用部分唯一索引限制同一账号仅一个活动会话；跨设备离线同时开始时，后同步设备会收到冲突并保留本机记录供处理。
账号退出后清除令牌并切换独立的本地 `owner_scope`；不得让下一个账号读到前一个账号的本地数据。游客导入由用户主动触发，账号与游客数据在导入前按作用域分离。

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
├── tests/                        # 业务规则、状态机、同步单元测试
├── integration/                  # 本机 Supabase Auth/RLS 集成测试
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
| 游客转账号丢数据 | 显式确认、原子本地写入；多设备导入与中断恢复需真机验收 |
| 音频后台行为平台差异 | 先验证 iOS/Android 真机；必要时收窄首版后台音频承诺 |
| Supabase 免费额度、区域与可用性 | 初始化前确认地域和预算；保留本地优先体验 |

## 8. 参考资料

- [Expo BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/)：后台任务由系统调度，不能用作精确计时。
- [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/)：后台播放需要平台配置与真机验证。
- [Expo local storage guidance](https://docs.expo.dev/develop/user-interface/store-data/)：SQLite 与 SecureStore 的适用范围。
- [Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native)、[Supabase Expo quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native)：身份持久化、环境变量和 RLS。

## 8. AI 推荐扩展

规则与 AI 共用 `src/domain/focusRecommendation.ts` 的方案类型与业务校验。AI 请求由 Supabase Edge Function 代理，移动端只发送当前任务、状态及聚合历史；模型密钥、调用限额和超时配置仅在服务端。推荐决策和最终会话结果按账号隔离持久化，详见 [AI_RECOMMENDATION.md](AI_RECOMMENDATION.md)。
