# Concentration

Concentration 是面向自主学习者的本地优先专注 App。当前仓库包含 **可运行的本地优先 MVP**：游客可以创建任务、选择状态、接受规则推荐、完成 Focus Session，并查看真实历史与统计。已加入 Supabase Auth、按账号隔离的 SQLite 缓存与 outbox 同步；未配置凭据时仍是完整游客本地体验。

## 运行

需要 Node.js、npm，以及 iOS/Android 设备上的 Expo Go 或相应模拟器。当前实现基于 Expo SDK 57。

```bash
npm ci
npm start
```

在 Expo CLI 中扫描二维码，或使用 `npm run ios` / `npm run android` 启动可用的模拟器。Web 预览可运行 `npm run web`；Expo SQLite 的 Web 支持仍处于 alpha，正式验证以 iOS/Android 真机为准。

游客模式不需要 `.env`。使用云端账号前复制 `.env.example` 为 `.env` 并填写 Supabase Project URL 和 publishable key；配置步骤见 [Supabase Setup](docs/SUPABASE_SETUP.md)。线上项目尚未连接。

## 分享 Web 体验版

项目可导出为静态 Expo Web 站点，`vercel.json` 已配置 SPA 路由和 Web SQLite 所需的 COEP/COOP 响应头。在 Vercel Dashboard 导入 GitHub 仓库 `Weijh1210/concentration`，选择 `main` 分支并检查配置：Framework Preset 为 `Other`、Build Command 为 `npx expo export --platform web`、Output Directory 为 `dist`。完成部署后，分享 Vercel 给出的 HTTPS 地址即可。无需 Supabase 配置也可体验游客和离线规则推荐；登录、云同步和真实 AI 仍需先配置 Supabase 服务端及公开客户端变量。

Web 版在每位访客自己的浏览器中保存本地数据，不会让访客共享任务或统计。`expo-sqlite` 的 Web 支持仍处于 alpha；部署后应在目标浏览器验证创建任务、专注计时、反馈、刷新恢复和深链接。Vercel 托管的是 Web 体验版，不会生成 iOS/Android 安装包。

## 检查

```bash
npm run typecheck
npm test
npm run check
# 本机 Supabase 启动，并在另一终端运行 supabase functions serve 后
npm run test:integration
```

可选打包检查：

```bash
npx expo export --platform ios --output-dir /tmp/concentration-ios
npx expo export --platform android --output-dir /tmp/concentration-android
```

## 已实现

- Welcome / Onboarding、Home、任务创建与编辑、状态选择、规则推荐、Start Mode、Focus Timer、反馈、Growth、Profile / Settings，以及明确标注的 Together 预告。
- 任务创建、编辑、完成、重新打开、软删除；会话关联任务或自由专注。
- 状态影响推荐；用户可调整正式专注时长或跳过 Start Mode，启动时间计入可用时间。
- 离线规则和用户主动触发的 AI 任务拆解；严格 Schema 与业务校验、服务端限额、错误回退，采用/修改/拒绝和最终会话结果持久化。真实 AI 需要单独配置服务端 Key。
- 基于时间戳的计时、暂停、恢复、提前结束、计划到时等待确认；App 重开恢复进行中的会话。
- SQLite 本地持久化与版本化 migration；历史、今日/近 7 天时长和连续天数由真实会话计算。
- 浅色、深色、跟随系统主题；随包提供的自生成白噪音，音量可选，默认关闭。

## 尚未实现

- 真实线上 Supabase 项目配置、迁移与 Edge Function 部署尚未进行；邮箱确认和跨设备真机流程需在配置后验收。
- 真实模型端到端验收、Together 实时功能、通知与秒级后台提醒。
- 白噪音在锁屏和后台持续播放尚未做真机验证，当前只承诺 App 前台播放。
- 原生安装包、商店发布与生产监控。

## 手动验收建议

1. 游客启动 → 创建任务 → 选“有点难开始”与可用时间 → 检查推荐含 5 分钟启动且总时长不超可用时间。
2. Start Mode 暂停 → 强制关闭并重开 App → 检查暂停时长未增加 → 继续进入正式专注。
3. Focus Timer 暂停/恢复、开启白噪音、提前结束 → 填写反馈 → Growth 查看历史和真实时长。
4. 编辑、完成、重新打开和删除任务；删除后历史会话仍可查看。
5. 浅色/深色切换，重开 App 后保持；iOS 和 Android 分别检查锁屏、后台、音频中断与系统时间变化。

当前测试环境没有可用的 iOS Simulator 或 Android Debug Bridge，因此原生运行与真机行为需要在设备上手动验证。依赖安装时 `npm audit` 报告 28 项传递依赖公告（10 moderate、18 high），主要位于 Expo/Metro 工具链；`npm audit fix --force` 会引入破坏性版本变化，发布前应随 Expo 兼容版本复核并处理。

设计依据：[PRD](docs/PRD.md)、[Architecture](docs/ARCHITECTURE.md)、[Database](docs/DATABASE.md)、[Roadmap](docs/ROADMAP.md)。
