import type { SupabaseClient } from '@supabase/supabase-js';
import type { EntityType, OutboxEntry } from '../local/database';
import { toCloudPayload } from './mapper';
import type { Task, FocusSession, SessionFeedback } from '../../domain/types';
import type { FocusRecommendationRecord } from '../../domain/focusRecommendation';
export class CloudError extends Error {
  constructor(message: string, readonly code: string | undefined) { super(message); }
  get conflict() { return this.code === '40001' || this.code === '42501' || this.code === '22023' || !!this.code?.startsWith('23'); }
}
export interface CloudRecord { type: EntityType; row: Record<string, any> }
export interface CloudTransport {
  apply(entry: OutboxEntry, userId: string): Promise<number>;
  pull(userId: string): Promise<CloudRecord[]>;
}
export function createCloudTransport(client: SupabaseClient): CloudTransport {
  return {
    async apply(entry, userId) {
      const payload = toCloudPayload(entry.entity_type,
        JSON.parse(entry.payload_json) as Task | FocusSession | SessionFeedback | FocusRecommendationRecord, userId);
      const { data, error } = entry.entity_type === 'recommendation'
        ? await client.rpc('apply_recommendation_change', { p_operation_id:entry.operation_id,
          p_payload:payload,p_expected_revision:entry.expected_revision })
        : await client.rpc('apply_sync_change', {
          p_operation_id: entry.operation_id, p_entity_type: entry.entity_type,
          p_payload: payload, p_expected_revision: entry.expected_revision,
        });
      if (error) throw new CloudError(error.message, error.code);
      if (typeof data !== 'number') throw new CloudError('云端返回了无效版本号', 'INVALID_RESULT');
      return data;
    },
    async pull(userId) {
      const result: CloudRecord[] = [];
      const specs = [['tasks','task'],['focus_sessions','session'],['session_feedback','feedback'],['focus_recommendations','recommendation']] as const;
      for (const [table,type] of specs) {
        for (let from = 0; ; from += 500) {
          const { data, error } = await client.from(table).select('*').eq('user_id',userId)
            .order('created_at', { ascending: true }).order(type === 'feedback' ? 'session_id' : 'id', { ascending: true }).range(from,from + 499);
          if (error) throw new CloudError(error.message,error.code);
          for (const row of data ?? []) result.push({ type, row });
          if ((data?.length ?? 0) < 500) break;
        }
      }
      return result;
    },
  };
}
