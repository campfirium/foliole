import { computeSyncContentHash } from '../database/syncState.js';
import type { DbPort } from '../sync/dbPort.js';
import type { SyncObjectRecord } from '../sync/syncObjectRecord.js';

import { readDailyFlowSyncFact } from './dailyFlowSyncFact.js';
import { projectDailyFlowSync } from './dailyFlowSyncProjection.js';

function decode(record: SyncObjectRecord) {
  if (record.deleted_at || !record.payload_json) throw new Error('daily_flow_sync_fact_invalid');
  const fact = readDailyFlowSyncFact(record.payload_json);
  if (fact.id !== record.object_id || fact.occurredAt !== record.updated_at ||
    computeSyncContentHash('daily_flow', JSON.parse(record.payload_json)) !== record.content_hash) {
    throw new Error('daily_flow_sync_fact_identity_invalid');
  }
  return fact;
}

export async function dailyFlowFactApplyStatus(db: DbPort, record: SyncObjectRecord) {
  const incoming = decode(record);
  const [existing] = await db.query<{ payload_json: string }>(
    'SELECT payload_json FROM daily_flow_sync_facts WHERE id = ?', [incoming.id]);
  if (!existing) return 'apply' as const;
  if (computeSyncContentHash('daily_flow', JSON.parse(existing.payload_json)) !== record.content_hash) {
    throw new Error('daily_flow_sync_operation_mismatch');
  }
  return 'already_applied' as const;
}

export async function applyDailyFlowSyncFact(db: DbPort, record: SyncObjectRecord) {
  const fact = decode(record);
  await db.run(`INSERT INTO daily_flow_sync_facts
    (id, root_id, occurred_at, day_start, payload_json, day_end, parent_id, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [fact.id, fact.rootId, fact.occurredAt, fact.settings.dayWindow.start, JSON.stringify(fact),
      fact.settings.dayWindow.end, fact.parentId, fact.kind]);
  await projectDailyFlowSync(db, fact);
}
