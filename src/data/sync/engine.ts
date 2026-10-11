import type { CloudTransport } from '../remote/api';
import { CloudError } from '../remote/api';
import { fromCloudFeedback, fromCloudSession, fromCloudTask, fromCloudRecommendation } from '../remote/mapper';
import type { EntityType, OutboxEntry } from '../local/database';
import type { FocusRecommendationRecord } from '../../domain/focusRecommendation';
import type { Task, FocusSession, SessionFeedback } from '../../domain/types';
export interface SyncRepository {
  listOutbox(scope: string): Promise<OutboxEntry[]>;
  markSynced(entry: OutboxEntry, revision: number): Promise<void>;
  markRetry(entry: OutboxEntry, conflict: boolean): Promise<void>;
  pendingCounts(scope: string): Promise<{pending:number;conflict:number}>;
  hasPendingEntity(scope: string,type: EntityType,id: string): Promise<boolean>;
  saveTask(value: Task,scope: string,enqueue: boolean): Promise<void>;
  saveSession(value: FocusSession,scope: string,enqueue: boolean): Promise<void>;
  saveFeedback(value: SessionFeedback,scope: string,enqueue: boolean): Promise<void>;
  saveRecommendation(value: FocusRecommendationRecord,scope: string,enqueue: boolean): Promise<void>;
  setServerRevision(scope: string,type: EntityType,id: string,revision: number): Promise<void>;
}
export interface SyncResult { pushed: number; pulled: number; pending: number; conflicts: number }
export async function syncOnce(scope: string, userId: string, transport: CloudTransport,
  repository: SyncRepository): Promise<SyncResult> {
  if (scope !== `user:${userId}`) throw new Error('账号作用域不匹配');
  let pushed = 0;
  const entries = await repository.listOutbox(scope);
  for (const entry of entries) {
    try {
      const revision = await transport.apply(entry,userId);
      await repository.markSynced(entry,revision);
      pushed++;
    } catch (error) {
      await repository.markRetry(entry,error instanceof CloudError && error.conflict);
      // Preserve operation order and parent references; later operations wait for this one.
      break;
    }
  }
  const pending = await repository.pendingCounts(scope);
  if (pending.pending || pending.conflict) return { pushed,pulled:0,pending:pending.pending,conflicts:pending.conflict };
  const records = await transport.pull(userId);
  let pulled = 0;
  for (const record of records) {
    if (record.row.user_id !== userId) throw new Error('云端返回了其他账号的数据');
    const id = record.type === 'feedback' ? record.row.session_id : record.row.id;
    if (await repository.hasPendingEntity(scope,record.type,id)) continue;
    if (record.type === 'task') await repository.saveTask(fromCloudTask(record.row),scope,false);
    else if (record.type === 'session') await repository.saveSession(fromCloudSession(record.row),scope,false);
    else if (record.type === 'feedback') await repository.saveFeedback(fromCloudFeedback(record.row),scope,false);
    else await repository.saveRecommendation(fromCloudRecommendation(record.row),scope,false);
    await repository.setServerRevision(scope,record.type,id,Number(record.row.revision));
    pulled++;
  }
  return { pushed,pulled,pending:0,conflicts:0 };
}
