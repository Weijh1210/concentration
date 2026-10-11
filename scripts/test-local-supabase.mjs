import { spawnSync } from 'node:child_process';
const status = spawnSync('supabase',['status','-o','json'],{encoding:'utf8'});
if (status.status !== 0) { process.stderr.write(status.stderr); process.exit(status.status || 1); }
const local = JSON.parse(status.stdout);
if (!local.API_URL.startsWith('http://127.0.0.1:54421')) throw new Error('Refusing to test a non-local project');
const env = { ...process.env, LOCAL_SUPABASE_URL:local.API_URL,
  LOCAL_SUPABASE_KEY:local.PUBLISHABLE_KEY, LOCAL_SUPABASE_ADMIN_KEY:local.SERVICE_ROLE_KEY };
const result = spawnSync(process.execPath,['--import','tsx','--test','integration/supabase.test.ts'],
  { stdio:'inherit',env });
process.exit(result.status || 0);
