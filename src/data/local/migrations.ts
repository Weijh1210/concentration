export const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
        estimated_minutes INTEGER, status TEXT NOT NULL CHECK(status IN ('open', 'completed')),
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, deleted_at, updated_at DESC);
      CREATE TABLE IF NOT EXISTS focus_sessions (
        id TEXT PRIMARY KEY, task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        status TEXT NOT NULL, phase TEXT NOT NULL,
        started_at INTEGER NOT NULL, ended_at INTEGER, active_segment_started_at INTEGER, paused_at INTEGER,
        accumulated_start_ms INTEGER NOT NULL DEFAULT 0, accumulated_focus_ms INTEGER NOT NULL DEFAULT 0,
        planned_duration_ms INTEGER NOT NULL, extended INTEGER NOT NULL DEFAULT 0,
        state_json TEXT NOT NULL, recommendation_reason_code TEXT NOT NULL,
        recommendation_rule_version TEXT NOT NULL, end_reason TEXT, clock_warning INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_started ON focus_sessions(started_at DESC);
      CREATE TABLE IF NOT EXISTS session_feedback (
        session_id TEXT PRIMARY KEY REFERENCES focus_sessions(id) ON DELETE CASCADE,
        perceived_focus INTEGER, interruption_count INTEGER, note TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE tasks ADD COLUMN owner_scope TEXT NOT NULL DEFAULT 'guest';
      ALTER TABLE tasks ADD COLUMN server_revision INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE focus_sessions ADD COLUMN owner_scope TEXT NOT NULL DEFAULT 'guest';
      ALTER TABLE focus_sessions ADD COLUMN server_revision INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE session_feedback ADD COLUMN owner_scope TEXT NOT NULL DEFAULT 'guest';
      ALTER TABLE session_feedback ADD COLUMN server_revision INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX idx_tasks_owner ON tasks(owner_scope,updated_at DESC);
      CREATE INDEX idx_sessions_owner ON focus_sessions(owner_scope,started_at DESC);
      CREATE INDEX idx_feedback_owner ON session_feedback(owner_scope);
      CREATE TABLE sync_outbox (
        operation_id TEXT PRIMARY KEY, owner_scope TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('task','session','feedback')),
        entity_id TEXT NOT NULL, payload_json TEXT NOT NULL,
        expected_revision INTEGER NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending','conflict')),
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_outbox_ready ON sync_outbox(owner_scope,status,next_retry_at,created_at);
      CREATE TABLE sync_cursors (owner_scope TEXT PRIMARY KEY, last_updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z');
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE focus_recommendations (
        id TEXT PRIMARY KEY, owner_scope TEXT NOT NULL, task_id TEXT,
        task_type TEXT NOT NULL, input_json TEXT NOT NULL, plan_json TEXT NOT NULL,
        final_plan_json TEXT, source TEXT NOT NULL CHECK(source IN ('rule','ai')),
        fallback_reason TEXT, decision TEXT NOT NULL CHECK(decision IN ('pending','accepted','modified','rejected')),
        session_id TEXT, session_status TEXT, actual_focus_ms INTEGER, feedback_focus INTEGER,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, server_revision INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL,
        FOREIGN KEY(session_id) REFERENCES focus_sessions(id) ON DELETE SET NULL
      );
      CREATE INDEX idx_recommendations_owner ON focus_recommendations(owner_scope,created_at DESC);
      CREATE INDEX idx_recommendations_session ON focus_recommendations(owner_scope,session_id);
      CREATE TABLE sync_outbox_new (
        operation_id TEXT PRIMARY KEY, owner_scope TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('task','session','feedback','recommendation')),
        entity_id TEXT NOT NULL, payload_json TEXT NOT NULL,
        expected_revision INTEGER NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending','conflict')),
        created_at INTEGER NOT NULL
      );
      INSERT INTO sync_outbox_new SELECT * FROM sync_outbox;
      DROP TABLE sync_outbox;
      ALTER TABLE sync_outbox_new RENAME TO sync_outbox;
      CREATE INDEX idx_outbox_ready ON sync_outbox(owner_scope,status,next_retry_at,created_at);
    `,
  },
] as const;
