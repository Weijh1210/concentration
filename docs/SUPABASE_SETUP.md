# Supabase 手动配置与验证

## 需要手动完成

1. 在 Supabase Dashboard 创建项目；选择适合用户的区域。此步骤可能产生费用，开发脚本不会代建或部署。
2. 在 **Project Settings → API** 复制 Project URL 与 **publishable key**，填入项目根目录 `.env` 的 `EXPO_PUBLIC_SUPABASE_URL`、`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。不要把 `service_role` / secret key 放进 Expo 环境变量、Git 或 App 包。
3. 在 **Authentication → Providers → Email** 启用 Email/Password，按产品需要开启邮箱确认。当前界面注册后会提示用户确认邮箱，再手动返回 App 登录。生产环境要设置可访问的 **Site URL**、确认邮件模板和 SMTP 发信配置；默认邮件服务不应视为正式发信能力。
4. 审阅 `supabase/migrations/` 的三个迁移文件，在已关联的项目执行迁移（推荐 Supabase CLI `supabase link` 后 `supabase db push`）。执行线上迁移前由你确认目标项目；本任务仅在本机栈测试。
5. 部署 `supabase/functions/delete-account` 与 `supabase/functions/recommend-focus`，保持 `verify_jwt=true`。Edge Function 的 `SUPABASE_SERVICE_ROLE_KEY` 必须仅存在 Supabase 服务端环境。客户端通过用户 JWT 调用，函数再次查询 Auth 用户。删除账号前如未来加入 Storage 文件，须先清理其对象。
6. 如果需要真实 AI 建议，在 Supabase Dashboard 的 Edge Function Secrets 设置 `AI_API_KEY`、`AI_MODEL`，以及可选的 `AI_PROVIDER`、`AI_BASE_URL`、`AI_TIMEOUT_MS`、`AI_MAX_OUTPUT_TOKENS`。详见 `docs/AI_RECOMMENDATION.md`。这些值不进入项目根目录的 Expo `.env` 或 App 构建；本机仅放入被 Git 忽略的 `supabase/functions/.env`。无 Key 时函数返回明确的规则方案。
7. 在真实 iOS/Android 设备分别测试注册确认、登录、退出、断网写入、恢复网络、跨设备记录、删除账号；Expo Go 真机访问本机 Supabase 时，URL 需用电脑局域网地址，不能用手机的 `127.0.0.1`。

## 本机验证

本机 Supabase CLI 使用 `supabase/config.toml` 的 54421–54424 端口，避免与其他项目默认端口冲突：

```bash
supabase start
# 另开终端：supabase functions serve
npm run test:integration
supabase stop
```

`test:integration` 从本机 CLI 状态读取测试凭据，只接受 `http://127.0.0.1:54421`，不会对线上项目运行。测试使用本机服务端管理员凭据确认随机测试邮箱，并在结束时删除测试用户；该凭据从不进入移动端。`npm run check` 运行 TypeScript 与纯本地单元测试。

## 已知边界

- 目前只实现 Email/Password，没有 OAuth、密码重置或自动打开确认链接。
- 冲突按整个业务记录解决，尚无字段级合并；选择本机版本会以当前云端 revision 重试，选择云端版本会丢弃该记录的待同步本机改动。
- 云端环境表已创建，当前 App 仍使用内置环境和音效，不提供自定义环境 UI。
- Edge Function 代码已写入 Git，但尚未部署到真实 Supabase 项目。
