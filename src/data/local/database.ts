import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import type { FocusSession, SessionFeedback, Task } from '../../domain/types';
import type { FocusRecommendationRecord } from '../../domain/focusRecommendation';
import { migrations } from './migrations';

const DB_NAME = 'concentration.db';
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

interface TaskRow {
  id: string; title: string; notes: string; estimated_minutes: number | null; status: Task['status'];
  created_at: number; updated_at: number; deleted_at: number | null; owner_scope: string; server_revision: number;
}

interface SessionRow {
  id: string; task_id: string | null; status: FocusSession['status']; phase: FocusSession['phase'];
  started_at: number; ended_at: number | null; active_segment_started_at: number | null; paused_at: number | null;
  accumulated_start_ms: number; accumulated_focus_ms: number; planned_duration_ms: number; extended: number;
  state_json: string; recommendation_reason_code: string; recommendation_rule_version: string;
  end_reason: FocusSession['endReason']; clock_warning: number; created_at: number; updated_at: number; owner_scope: string; server_revision: number;
}

interface FeedbackRow {
  session_id: string; perceived_focus: number | null; interruption_count: 0 | 1 | 2 | null;
  note: string; created_at: number; updated_at: number; owner_scope: string; server_revision: number;
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);');
  const applied = await db.getAllAsync<{ version: number }>('SELECT version FROM schema_migrations');
  const appliedVersions = new Set(applied.map((row) => row.version));
  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;
    await withWriteTransaction(db, async (tx) => {
      await tx.execAsync(migration.sql);
      await tx.runAsync('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)', [migration.version, Date.now()]);
    });
  }
  return db;
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= openDatabase().catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

type Writer = Pick<SQLite.SQLiteDatabase, 'runAsync' | 'execAsync' | 'getFirstAsync'>;
async function withWriteTransaction(db: SQLite.SQLiteDatabase, work: (writer: Writer) => Promise<void>): Promise<void> {
  if (Platform.OS === 'web') await db.withTransactionAsync(() => work(db));
  else await db.withExclusiveTransactionAsync((tx) => work(tx));
}

export async function listTasks(scope = 'guest'): Promise<Task[]> {
  const rows = await (await getDatabase()).getAllAsync<TaskRow>('SELECT * FROM tasks WHERE owner_scope=? ORDER BY updated_at DESC', [scope]);
  return rows.map((row) => ({
    id: row.id, title: row.title, notes: row.notes, estimatedMinutes: row.estimated_minutes,
    status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at,
  }));
}

export async function saveTask(task: Task, scope = 'guest', enqueue = true): Promise<void> {
  const db = await getDatabase();
  await withWriteTransaction(db, async (tx) => {
    await tx.runAsync(`INSERT INTO tasks (id,title,notes,estimated_minutes,status,created_at,updated_at,deleted_at)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, notes=excluded.notes,
      estimated_minutes=excluded.estimated_minutes, status=excluded.status,
      updated_at=excluded.updated_at, deleted_at=excluded.deleted_at`,
      [task.id, task.title, task.notes, task.estimatedMinutes, task.status, task.createdAt, task.updatedAt, task.deletedAt]);
    await tx.runAsync('UPDATE tasks SET owner_scope=? WHERE id=?', [scope, task.id]);
    if (enqueue && scope.startsWith('user:')) await queueChange(tx, scope, 'task', task.id, task);
  });
}

export async function listSessions(scope = 'guest'): Promise<FocusSession[]> {
  const rows = await (await getDatabase()).getAllAsync<SessionRow>('SELECT * FROM focus_sessions WHERE owner_scope=? ORDER BY started_at DESC', [scope]);
  return rows.map((row) => ({
    id: row.id, taskId: row.task_id, status: row.status, phase: row.phase,
    startedAt: row.started_at, endedAt: row.ended_at, activeSegmentStartedAt: row.active_segment_started_at,
    pausedAt: row.paused_at, accumulatedStartMs: row.accumulated_start_ms,
    accumulatedFocusMs: row.accumulated_focus_ms, plannedDurationMs: row.planned_duration_ms,
    extended: row.extended === 1, state: JSON.parse(row.state_json) as FocusSession['state'],
    recommendationReasonCode: row.recommendation_reason_code,
    recommendationRuleVersion: row.recommendation_rule_version, endReason: row.end_reason,
    clockWarning: row.clock_warning === 1, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

async function writeSessionRow(tx: Writer, session: FocusSession, scope: string, enqueue: boolean): Promise<void> {
    await tx.runAsync(`INSERT INTO focus_sessions (
      id,task_id,status,phase,started_at,ended_at,active_segment_started_at,paused_at,
      accumulated_start_ms,accumulated_focus_ms,planned_duration_ms,extended,state_json,
      recommendation_reason_code,recommendation_rule_version,end_reason,clock_warning,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      status=excluded.status, phase=excluded.phase, ended_at=excluded.ended_at,
      active_segment_started_at=excluded.active_segment_started_at, paused_at=excluded.paused_at,
      accumulated_start_ms=excluded.accumulated_start_ms, accumulated_focus_ms=excluded.accumulated_focus_ms,
      extended=excluded.extended, end_reason=excluded.end_reason, clock_warning=excluded.clock_warning,
      updated_at=excluded.updated_at`, [
      session.id, session.taskId, session.status, session.phase, session.startedAt, session.endedAt,
      session.activeSegmentStartedAt, session.pausedAt, session.accumulatedStartMs,
      session.accumulatedFocusMs, session.plannedDurationMs, session.extended ? 1 : 0,
      JSON.stringify(session.state), session.recommendationReasonCode, session.recommendationRuleVersion,
      session.endReason, session.clockWarning ? 1 : 0, session.createdAt, session.updatedAt,
    ]);
    await tx.runAsync('UPDATE focus_sessions SET owner_scope=? WHERE id=?', [scope, session.id]);
    if (enqueue && scope.startsWith('user:')) await queueChange(tx, scope, 'session', session.id, session);
 }
export async function saveSession(session: FocusSession, scope = 'guest', enqueue = true): Promise<void> {
  const db = await getDatabase();
  await withWriteTransaction(db, tx => writeSessionRow(tx,session,scope,enqueue));
}

export async function listFeedback(scope = 'guest'): Promise<SessionFeedback[]> {
  const rows = await (await getDatabase()).getAllAsync<FeedbackRow>('SELECT * FROM session_feedback WHERE owner_scope=?', [scope]);
  return rows.map((row) => ({
    sessionId: row.session_id, perceivedFocus: row.perceived_focus,
    interruptionCount: row.interruption_count, note: row.note,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

async function writeFeedbackRow(tx: Writer, feedback: SessionFeedback, scope: string, enqueue: boolean): Promise<void> {
    await tx.runAsync(`INSERT INTO session_feedback (session_id,perceived_focus,interruption_count,note,created_at,updated_at)
      VALUES (?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET
      perceived_focus=excluded.perceived_focus, interruption_count=excluded.interruption_count,
      note=excluded.note, updated_at=excluded.updated_at`, [
      feedback.sessionId, feedback.perceivedFocus, feedback.interruptionCount,
      feedback.note, feedback.createdAt, feedback.updatedAt,
    ]);
    await tx.runAsync('UPDATE session_feedback SET owner_scope=? WHERE session_id=?', [scope, feedback.sessionId]);
    if (enqueue && scope.startsWith('user:')) await queueChange(tx, scope, 'feedback', feedback.sessionId, feedback);
 }
export async function saveFeedback(feedback: SessionFeedback, scope = 'guest', enqueue = true): Promise<void> {
  const db = await getDatabase();
  await withWriteTransaction(db, tx => writeFeedbackRow(tx,feedback,scope,enqueue));
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await (await getDatabase()).getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key=?', [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await (await getDatabase()).runAsync('INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value]);
}

export async function clearLocalData(): Promise<void> {
  const db = await getDatabase();
  await withWriteTransaction(db, async (tx) => {
    await tx.execAsync('DELETE FROM focus_recommendations; DELETE FROM session_feedback; DELETE FROM focus_sessions; DELETE FROM tasks; DELETE FROM sync_outbox; DELETE FROM sync_cursors; DELETE FROM app_settings;');
  });
}

export type EntityType = 'task' | 'session' | 'feedback' | 'recommendation';
export interface OutboxEntry {
  operation_id: string; owner_scope: string; entity_type: EntityType; entity_id: string;
  payload_json: string; expected_revision: number; attempt_count: number; next_retry_at: number;
  status: 'pending' | 'conflict'; created_at: number;
}
async function queueChange(tx: Writer, scope: string, type: EntityType, id: string, payload: unknown): Promise<void> {
  const column = type === 'feedback' ? 'session_id' : 'id';
  const table = type === 'task' ? 'tasks' : type === 'session' ? 'focus_sessions' : type === 'feedback' ? 'session_feedback' : 'focus_recommendations';
  const row = await (tx as SQLite.SQLiteDatabase).getFirstAsync<{ server_revision: number }>(
    `SELECT server_revision FROM ${table} WHERE ${column}=? AND owner_scope=?`, [id, scope]);
  const pending = await (tx as SQLite.SQLiteDatabase).getFirstAsync<{ count: number }>(
    'SELECT count(*) AS count FROM sync_outbox WHERE owner_scope=? AND entity_type=? AND entity_id=?', [scope, type, id]);
  await tx.runAsync(`INSERT INTO sync_outbox(operation_id,owner_scope,entity_type,entity_id,payload_json,expected_revision,created_at)
    VALUES(?,?,?,?,?,?,?)`, [Crypto.randomUUID(), scope, type, id, JSON.stringify(payload),
    (row?.server_revision ?? 0) + (pending?.count ?? 0), Date.now()]);
}
export async function listOutbox(scope: string): Promise<OutboxEntry[]> {
  return (await getDatabase()).getAllAsync<OutboxEntry>(
    `SELECT * FROM sync_outbox WHERE owner_scope=? AND status='pending' AND next_retry_at<=?
     ORDER BY created_at, rowid`, [scope, Date.now()]);
}
export async function markSynced(entry: OutboxEntry, revision: number): Promise<void> {
  const db = await getDatabase();
  await withWriteTransaction(db, async (tx) => {
    const table = entry.entity_type === 'task' ? 'tasks' : entry.entity_type === 'session' ? 'focus_sessions' : entry.entity_type === 'feedback' ? 'session_feedback' : 'focus_recommendations';
    const column = entry.entity_type === 'feedback' ? 'session_id' : 'id';
    await tx.runAsync(`UPDATE ${table} SET server_revision=? WHERE ${column}=? AND owner_scope=?`, [revision, entry.entity_id, entry.owner_scope]);
    await tx.runAsync('DELETE FROM sync_outbox WHERE operation_id=? AND owner_scope=?', [entry.operation_id,entry.owner_scope]);
    // Later queued edits were based on the preceding revision; the confirmed value is authoritative.
    await tx.runAsync(`UPDATE sync_outbox SET expected_revision=expected_revision+? WHERE owner_scope=? AND entity_type=?
      AND entity_id=? AND created_at>?`, [revision - entry.expected_revision - 1, entry.owner_scope, entry.entity_type,entry.entity_id,entry.created_at]);
  });
}
export async function markRetry(entry: OutboxEntry, conflict: boolean): Promise<void> {
  const attempts = entry.attempt_count + 1;
  const delay = Math.min(300000, 1000 * 2 ** Math.min(8, attempts)) + Math.floor(Math.random() * 1000);
  await (await getDatabase()).runAsync(
    'UPDATE sync_outbox SET status=?,attempt_count=?,next_retry_at=? WHERE operation_id=?',
    [conflict ? 'conflict' : 'pending', attempts, Date.now() + delay, entry.operation_id]);
}
export async function pendingCounts(scope: string): Promise<{ pending: number; conflict: number }> {
  const rows = await (await getDatabase()).getAllAsync<{status: 'pending' | 'conflict'; count: number}>(
    'SELECT status,count(*) AS count FROM sync_outbox WHERE owner_scope=? GROUP BY status', [scope]);
  return { pending: rows.find(x => x.status === 'pending')?.count ?? 0,
    conflict: rows.find(x => x.status === 'conflict')?.count ?? 0 };
}
export async function getCursor(scope: string): Promise<string> {
  const row = await (await getDatabase()).getFirstAsync<{last_updated_at: string}>(
    'SELECT last_updated_at FROM sync_cursors WHERE owner_scope=?', [scope]);
  return row?.last_updated_at ?? '1970-01-01T00:00:00.000Z';
}
export async function setCursor(scope: string, cursor: string): Promise<void> {
  await (await getDatabase()).runAsync(`INSERT INTO sync_cursors(owner_scope,last_updated_at) VALUES(?,?)
    ON CONFLICT(owner_scope) DO UPDATE SET last_updated_at=excluded.last_updated_at`, [scope,cursor]);
}
export async function hasPendingEntity(scope: string, type: EntityType, id: string): Promise<boolean> {
  const row = await (await getDatabase()).getFirstAsync<{n:number}>(
    'SELECT 1 AS n FROM sync_outbox WHERE owner_scope=? AND entity_type=? AND entity_id=? LIMIT 1',[scope,type,id]);
  return !!row;
}
export async function setServerRevision(scope: string, type: EntityType, id: string, revision: number): Promise<void> {
  const table = type === 'task' ? 'tasks' : type === 'session' ? 'focus_sessions' : type === 'feedback' ? 'session_feedback' : 'focus_recommendations';
  const column = type === 'feedback' ? 'session_id' : 'id';
  await (await getDatabase()).runAsync(`UPDATE ${table} SET server_revision=? WHERE ${column}=? AND owner_scope=?`,[revision,id,scope]);
}
export async function clearScope(scope: string): Promise<void> {
  const db = await getDatabase();
  await withWriteTransaction(db, async tx => {
    await tx.runAsync('DELETE FROM sync_outbox WHERE owner_scope=?',[scope]);
    await tx.runAsync('DELETE FROM sync_cursors WHERE owner_scope=?',[scope]);
    await tx.runAsync('DELETE FROM focus_recommendations WHERE owner_scope=?',[scope]);
    await tx.runAsync('DELETE FROM session_feedback WHERE owner_scope=?',[scope]);
    await tx.runAsync('DELETE FROM focus_sessions WHERE owner_scope=?',[scope]);
    await tx.runAsync('DELETE FROM tasks WHERE owner_scope=?',[scope]);
  });
}
export async function listConflicts(scope: string): Promise<OutboxEntry[]> {
  return (await getDatabase()).getAllAsync<OutboxEntry>(
    "SELECT * FROM sync_outbox WHERE owner_scope=? AND status='conflict' ORDER BY created_at",[scope]);
}
export async function rebaseEntity(scope: string, type: EntityType, id: string, serverRevision: number): Promise<void> {
  const db = await getDatabase();
  await withWriteTransaction(db, async tx => {
    const rows = await (tx as SQLite.SQLiteDatabase).getAllAsync<OutboxEntry>(
      'SELECT * FROM sync_outbox WHERE owner_scope=? AND entity_type=? AND entity_id=? ORDER BY created_at,rowid',[scope,type,id]);
    for (let index=0; index<rows.length; index++) await tx.runAsync(
      "UPDATE sync_outbox SET expected_revision=?,status='pending',next_retry_at=0 WHERE operation_id=?",
      [serverRevision+index,rows[index].operation_id]);
  });
}
export async function discardEntityChanges(scope: string, type: EntityType, id: string): Promise<void> {
  // Keep the cache row until a successful pull replaces it. This preserves local FK links.
  await (await getDatabase()).runAsync(
    'DELETE FROM sync_outbox WHERE owner_scope=? AND entity_type=? AND entity_id=?',[scope,type,id]);
}

interface RecommendationRow {
  id:string; task_id:string|null; task_type:FocusRecommendationRecord['taskType'];
  input_json:string; plan_json:string; final_plan_json:string|null;
  source:FocusRecommendationRecord['source']; fallback_reason:string|null;
  decision:FocusRecommendationRecord['decision']; session_id:string|null;
  session_status:FocusRecommendationRecord['sessionStatus']; actual_focus_ms:number|null;
  feedback_focus:number|null; created_at:number; updated_at:number;
}
export async function listRecommendations(scope = 'guest'): Promise<FocusRecommendationRecord[]> {
  const rows = await (await getDatabase()).getAllAsync<RecommendationRow>(
    'SELECT * FROM focus_recommendations WHERE owner_scope=? ORDER BY created_at DESC',[scope]);
  return rows.map(row => ({ id:row.id,taskId:row.task_id,taskType:row.task_type,
    input:JSON.parse(row.input_json) as FocusRecommendationRecord['input'],
    plan:JSON.parse(row.plan_json) as FocusRecommendationRecord['plan'],
    finalPlan:row.final_plan_json ? JSON.parse(row.final_plan_json) as FocusRecommendationRecord['finalPlan'] : null,
    source:row.source,fallbackReason:row.fallback_reason,decision:row.decision,
    sessionId:row.session_id,sessionStatus:row.session_status,actualFocusMs:row.actual_focus_ms,
    feedbackFocus:row.feedback_focus,createdAt:row.created_at,updatedAt:row.updated_at }));
}
async function writeRecommendationRow(tx: Writer, value: FocusRecommendationRecord, scope: string, enqueue: boolean): Promise<void> {
    await tx.runAsync(`INSERT INTO focus_recommendations (
      id,owner_scope,task_id,task_type,input_json,plan_json,final_plan_json,source,
      fallback_reason,decision,session_id,session_status,actual_focus_ms,feedback_focus,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      owner_scope=excluded.owner_scope,task_id=excluded.task_id,task_type=excluded.task_type,
      input_json=excluded.input_json,plan_json=excluded.plan_json,final_plan_json=excluded.final_plan_json,
      source=excluded.source,fallback_reason=excluded.fallback_reason,decision=excluded.decision,
      session_id=excluded.session_id,session_status=excluded.session_status,
      actual_focus_ms=excluded.actual_focus_ms,feedback_focus=excluded.feedback_focus,updated_at=excluded.updated_at`,[
      value.id,scope,value.taskId,value.taskType,JSON.stringify(value.input),JSON.stringify(value.plan),
      value.finalPlan ? JSON.stringify(value.finalPlan) : null,value.source,value.fallbackReason,
      value.decision,value.sessionId,value.sessionStatus,value.actualFocusMs,value.feedbackFocus,
      value.createdAt,value.updatedAt,
    ]);
    if (enqueue && scope.startsWith('user:')) await queueChange(tx,scope,'recommendation',value.id,value);
 }
export async function saveRecommendation(value: FocusRecommendationRecord, scope = 'guest', enqueue = true): Promise<void> {
  const db = await getDatabase();
  await withWriteTransaction(db, tx => writeRecommendationRow(tx,value,scope,enqueue));
}

export async function saveSessionWithRecommendation(session: FocusSession,
  recommendation: FocusRecommendationRecord,scope = 'guest'): Promise<void> {
  const db = await getDatabase();
  await withWriteTransaction(db,async tx => {
    await writeSessionRow(tx,session,scope,true);
    await writeRecommendationRow(tx,recommendation,scope,true);
  });
}
export async function saveFeedbackWithRecommendation(feedback: SessionFeedback,
  recommendation: FocusRecommendationRecord,scope = 'guest'): Promise<void> {
  const db = await getDatabase();
  await withWriteTransaction(db,async tx => {
    await writeFeedbackRow(tx,feedback,scope,true);
    await writeRecommendationRow(tx,recommendation,scope,true);
  });
}
