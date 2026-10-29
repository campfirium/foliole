import { computeSyncContentHash } from '../database/syncState.js';
import type { DbPort } from '../sync/dbPort.js';
import type { SyncObjectRecord } from '../sync/syncObjectRecord.js';

import { dailyFlowFactHash } from './dailyFlowFactHash.js';
import { readDailyFlowFact, storeDailyFlowFact } from './dailyFlowFactStorage.js';
import { readDailyFlowSyncFact } from './dailyFlowSyncFact.js';

function decode(record: SyncObjectRecord) {
  if (record.deleted_at || !record.payload_json) throw new Error('daily_flow_sync_fact_invalid');
  const fact = readDailyFlowSyncFact(record.payload_json);
  if (fact.id !== record.object_id || fact.occurredAt !== record.updated_at ||
    computeSyncContentHash('daily_flow', JSON.parse(record.payload_json)) !== record.content_hash) {
    throw new Error('daily_flow_sync_fact_identity_invalid');
  }
  if (fact.kind === 'create') throw new Error('daily_flow_local_list_not_transferable');
  return fact;
}

export async function dailyFlowFactApplyStatus(db: DbPort, record: SyncObjectRecord) {
  const incoming = decode(record);
  const existing = await readDailyFlowFact(db, incoming.id);
  if (!existing) return 'apply' as const;
  if (dailyFlowFactHash(existing) !== record.content_hash) {
    throw new Error('daily_flow_sync_operation_mismatch');
  }
  return 'already_applied' as const;
}

export async function applyDailyFlowSyncFact(db: DbPort, record: SyncObjectRecord) {
  const fact = decode(record);
  await storeDailyFlowFact(db, fact);
  await db.run('UPDATE daily_flow_state SET invalidated=1 WHERE id=1');
}
