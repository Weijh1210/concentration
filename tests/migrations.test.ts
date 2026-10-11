import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from '../src/data/local/migrations';

test('local migration creates related tables and enforces foreign keys', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const migration of migrations) db.exec(migration.sql);
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  for (const name of ['tasks', 'focus_sessions', 'session_feedback', 'app_settings', 'sync_outbox', 'sync_cursors', 'focus_recommendations']) assert.ok(names.includes(name));
  assert.throws(() => db.prepare(`INSERT INTO session_feedback
    (session_id,perceived_focus,interruption_count,note,created_at,updated_at)
    VALUES ('missing',4,0,'',1,1)`).run());
  const taskColumns = db.prepare('PRAGMA table_info(tasks)').all().map((row) => row.name);
  assert.ok(taskColumns.includes('owner_scope'));
  assert.ok(taskColumns.includes('server_revision'));
  db.close();
});
