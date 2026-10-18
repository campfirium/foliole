import { z } from 'zod';

import type { NativeSyncObjectRecord } from '../../platform/nativeSyncContract.js';
import { NODE_CHILD_STATE_TYPES, nodeChildOwnerSql } from '../database/nodeChildStateSql.js';

import type { DbPort } from './dbPort.js';
import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import { applyFramedSyncObjectStateRecord, restoreFramedSyncObjectStateFact,
  selectFramedSyncObjectStateFact } from './framedSyncObjectStateFact.js';
import type { ApplySyncObjectsWithDbPortOptions } from './syncObjectApplyExecutor.js';

const childIdentity = z.tuple([z.enum(NODE_CHILD_STATE_TYPES), z.string().min(1), z.string().regex(/^[a-f0-9]{64}$/u)]);

export function parseFramedSyncNodeChildIdentity(factId: string) {
  const [objectType, globalId, hash] = childIdentity.parse(JSON.parse(factId));
  if (JSON.stringify([objectType, globalId, hash]) !== factId) throw new Error('framed_sync_node_child_fact_invalid');
  return { objectType, globalId, hash };
}

export async function selectFramedSyncNodeChildFact(db: DbPort, nodeId: string, factId: string): Promise<CanonicalFact> {
  const key = parseFramedSyncNodeChildIdentity(factId);
  const [owner] = await db.query<{ node_id: string }>(`SELECT ${nodeChildOwnerSql('state')} AS node_id
    FROM sync_object_state state WHERE object_type = ? AND object_id = ?`, [key.objectType, key.globalId]);
  if (owner?.node_id !== nodeId) throw new Error('framed_sync_source_changed');
  const fact = await selectFramedSyncObjectStateFact(db, key, `${key.objectType}:${key.hash}`);
  return { ...fact, factId, globalId: nodeId, objectType: 'node' };
}

export function restoreFramedSyncNodeChildFact(fact: CanonicalFact) {
  if (fact.objectType !== 'node' || fact.kind !== 1) throw new Error('framed_sync_node_child_fact_invalid');
  const key = parseFramedSyncNodeChildIdentity(fact.factId);
  const record = restoreFramedSyncObjectStateFact({ ...fact, ...key,
    factId: `${key.objectType}:${key.hash}` });
  assertOwner(record, fact.globalId);
  return record;
}

function assertOwner(record: NativeSyncObjectRecord, nodeId: string) {
  let owner: unknown;
  switch (record.object_type) {
    case 'import_source':
    case 'node_text_alternative': {
      if (record.deleted_at) return;
      const payload = z.object({ latest_node_id: z.string().optional(), node_id: z.string().optional() })
        .parse(JSON.parse(record.payload_json ?? 'null'));
      owner = record.object_type === 'import_source' ? payload.latest_node_id : payload.node_id;
      break;
    }
    case 'topic_daily_count': owner = record.object_id.slice(11); break;
    default: owner = record.object_id;
  }
  if (owner !== nodeId) throw new Error('framed_sync_node_child_owner_invalid');
}

export async function applyFramedSyncNodeChildFact(db: DbPort, fact: CanonicalFact,
  options?: ApplySyncObjectsWithDbPortOptions) {
  const record = restoreFramedSyncNodeChildFact(fact);
  const applied = await applyFramedSyncObjectStateRecord(db, record, options);
  if (record.deleted_at &&
      (record.object_type === 'import_source' || record.object_type === 'node_text_alternative')) {
    await db.run(`INSERT INTO sync_node_child_owners (object_type, object_id, node_id)
      SELECT object_type, object_id, ? FROM sync_object_state
      WHERE object_type = ? AND object_id = ? AND content_hash = ? AND deleted_at = ?
      ON CONFLICT(object_type, object_id) DO UPDATE SET node_id = CASE WHEN ? THEN excluded.node_id
        ELSE min(sync_node_child_owners.node_id, excluded.node_id) END`,
    [fact.globalId, record.object_type, record.object_id, record.content_hash, record.deleted_at, applied ? 1 : 0]);
  }
}
