# Concentration 开发协作规则

本文件约束后续在此仓库工作的 Codex/开发者。用户当次指令优先于本文件。当前仓库已有本地 Expo MVP；未经用户授权，不创建付费资源或部署线上服务。

## 产品边界

- 先读 `docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/DATABASE.md`、`docs/ROADMAP.md`。需求变化先更新相应文档，再实施。
- Focus Session 是核心实体；首版优先完整实现 Task → State → Recommend → Start Mode → Focus → Finish → Feedback → History。
- 不实现假按钮、假统计或伪装成真实 AI/同步的 Mock。未接通的外部服务需在代码与 UI 明确标注 Mock，并说明替换路径。

## 架构与代码

- 使用 React Native + Expo + TypeScript、Expo Router、Zustand、TanStack Query、SQLite、Supabase。引入其他主框架需写明理由。
- 页面只负责渲染和交互；业务规则放在 `src/domain`，用例放在 `src/application`，I/O 放在 adapter/repository。保持 TypeScript 严格类型，不滥用 `any`。
- 计时用状态机与持久化时间戳；每秒 UI tick 不得作为计时真值。所有状态变更及累计时长结算需原子化写入 SQLite。
- 本地优先：当前版本先提交 SQLite；接入云端时同时实现 outbox、异步同步、重复请求和冲突处理，禁止静默丢数据。
- 数据库 schema 修改需更新 `src/data/local/migrations.ts`；接入云端时同时提交 `supabase/migrations/`，云端每张用户表启用 RLS 并测试跨用户隔离。
- 所有真实密钥仅放环境变量/secret manager；只提交 `.env.example`。`EXPO_PUBLIC_*` 视为公开配置，不能放服务端 secret。

## 测试与交付

- 对推荐规则、状态机、计时、统计、同步幂等和冲突编写有意义的自动化测试；避免只复制实现的测试。
- 每阶段运行适用的类型检查、lint、自动化测试与构建；报告执行命令、通过/失败结果和未验证项。
- 涉及后台、锁屏、重启、音频和通知的功能必须做 iOS/Android 真机验证；模拟器通过不能替代真机结论。
- 变更后同步更新相关文档、迁移和环境变量示例。记录重要架构决策和风险。
- 不自行创建收费资源、生产云项目或执行线上部署；先把方案和可审阅结果准备好，再取得用户明确授权。

## 文档语言

产品和架构解释使用中文；代码、API、文件名、数据库字段和技术术语使用英文。
