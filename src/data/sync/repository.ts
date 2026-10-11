import { hasPendingEntity, listOutbox, markRetry, markSynced, pendingCounts, saveFeedback, saveSession, saveTask, saveRecommendation, setServerRevision } from '../local/database';
import type { SyncRepository } from './engine';
export const sqliteRepository: SyncRepository = { hasPendingEntity,listOutbox,markRetry,markSynced,pendingCounts,saveFeedback,saveSession,saveTask,saveRecommendation,setServerRevision };
