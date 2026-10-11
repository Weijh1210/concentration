import assert from 'node:assert/strict';
import test from 'node:test';
import { syncOnce, type SyncRepository } from '../src/data/sync/engine';
import { CloudError, type CloudTransport } from '../src/data/remote/api';
import type { OutboxEntry } from '../src/data/local/database';
const owner = '11111111-1111-4111-8111-111111111111';
const scope = `user:${owner}`;
function entry(type: OutboxEntry['entity_type'], id: string, expected: number): OutboxEntry {
  return { operation_id:`00000000-0000-4000-8000-${id.slice(0,12)}`,
    owner_scope:scope,entity_type:type,entity_id:id,payload_json:'{}',expected_revision:expected,
    attempt_count:0,next_retry_at:0,status:'pending',created_at:expected };
}
function fakeRepository(queue: OutboxEntry[]) {
  const saved: string[] = []; let conflict = 0;
  const repo: SyncRepository = {
    listOutbox: async () => [...queue],
    markSynced: async item => { queue.splice(queue.indexOf(item),1); },
    markRetry: async (_item,isConflict) => { if (isConflict) conflict++; },
    pendingCounts: async () => ({pending:queue.length,conflict}),
    hasPendingEntity: async () => false,
    saveTask: async task => { saved.push(`task:${task.id}`); },
    saveSession: async session => { saved.push(`session:${session.id}`); },
    saveFeedback: async feedback => { saved.push(`feedback:${feedback.sessionId}`); },
    saveRecommendation: async rec => { saved.push(`recommendation:${rec.id}`); },
    setServerRevision: async () => {},
  };
  return {repo,saved};
}
test('offline retry preserves ordering and later sync drains queue once', async () => {
  const queue = [entry('task','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',0),entry('session','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',0)];
  const {repo} = fakeRepository(queue);
  let online = false; const receipts = new Set<string>();
  const transport: CloudTransport = {
    apply: async e => { if (!online) throw new Error('offline'); receipts.add(e.operation_id); return 1; },
    pull: async () => [],
  };
  const first = await syncOnce(scope,owner,transport,repo);
  assert.equal(first.pending,2); assert.equal(queue.length,2);
  online = true;
  const second = await syncOnce(scope,owner,transport,repo);
  assert.equal(second.pushed,2); assert.equal(second.pending,0); assert.equal(receipts.size,2);
});
test('conflict stops dependent writes and is reported', async () => {
  const queue = [entry('task','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1),entry('session','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',0)];
  const {repo} = fakeRepository(queue);
  let attempts = 0;
  const transport: CloudTransport = {apply: async () => { attempts++; throw new CloudError('revision conflict','40001'); },pull:async()=>[]};
  const result = await syncOnce(scope,owner,transport,repo);
  assert.equal(attempts,1); assert.equal(result.conflicts,1); assert.equal(queue.length,2);
});
test('refuses another account scope and rejects cross-user pull records', async () => {
  const {repo} = fakeRepository([]);
  const transport: CloudTransport = {apply:async()=>1,pull:async()=>[{type:'task',row:{id:'x',user_id:'other'}}]};
  await assert.rejects(syncOnce('user:other',owner,transport,repo),/账号作用域/);
  await assert.rejects(syncOnce(scope,owner,transport,repo),/其他账号/);
});
