import type { DbPort } from './dbPort.js';
import { readFramedSyncMissingDependency } from './framedSyncInventoryRoundDelivery.js';
import type { SyncNodeRecordMetadata } from './syncNodeRecordSource.js';

export const REQUEST_SYNC_WRITE_REJECTED = 'request_sync_object_write_rejected:';

export function isReceivedNodeFactRejection(detail: string) {
  return detail.startsWith('framed_sync_review_conflict:') || detail.startsWith('framed_sync_parent_relation_conflict:');
}

export function isolateRequestSyncNodeWrites(records: readonly SyncNodeRecordMetadata[], errors: Map<string, string>,
  afterWrite: (tx: DbPort, nodeId: string) => Promise<unknown>) {
  const byNode = new Map<string, Set<string>>();
  for (const record of records) {
    if (record.is_tombstone || !record.snapshot.parent_id) continue;
    const parents = byNode.get(record.object_id) ?? new Set<string>();
    parents.add(record.snapshot.parent_id);
    byNode.set(record.object_id, parents);
  }
  return async (tx: DbPort, nodeId: string, write: () => Promise<void>) => {
    if (errors.has(nodeId)) return false;
    for (const parent of byNode.get(nodeId) ?? []) {
      if (!errors.has(parent)) continue;
      const [present] = await tx.query('SELECT 1 FROM nodes WHERE id = ?', [parent]);
      if (!present) {
        errors.set(nodeId, `framed_sync_node_parent_missing:${parent}`);
        return false;
      }
    }
    const result = await isolateRequestSyncObjectWrite(tx, async () => {
      await write();
      return afterWrite(tx, nodeId);
    }, nodeId);
    if (!result.ok) errors.set(nodeId, result.error);
    return result.ok;
  };
}

export async function isolateRequestSyncObjectWrite<T>(tx: DbPort, write: () => Promise<T>, nodeId?: string):
Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  await controlSavepoint(tx, 'SAVEPOINT request_sync_object');
  let value: T;
  try {
    value = await write();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const blocked = nodeId ? `sync_node_apply_blocked:${nodeId}` : undefined;
    const dependency = readFramedSyncMissingDependency(error);
    const rejection = dependency || (nodeId && isReceivedNodeFactRejection(detail)) ? detail
      : blocked && (detail === blocked || detail.startsWith(`${blocked} while running: `)) ? blocked
        : isSqliteTriggerRejection(error) ? `${REQUEST_SYNC_WRITE_REJECTED}${detail.split(' while running: ')[0]!.slice(0, 160)}` : undefined;
    if (!rejection) throw error;
    await controlSavepoint(tx, 'ROLLBACK TO request_sync_object');
    await controlSavepoint(tx, 'RELEASE request_sync_object');
    return { ok: false, error: rejection };
  }
  await controlSavepoint(tx, 'RELEASE request_sync_object');
  return { ok: true, value };
}

async function controlSavepoint(tx: DbPort, sql: string) {
  try { await tx.run(sql); }
  catch (error) { throw new Error('request_sync_object_savepoint_failed', { cause: error }); }
}

function isSqliteTriggerRejection(error: unknown) {
  const matches = (value: unknown) => value instanceof Error && (
    ('code' in value && value.code === 'SQLITE_CONSTRAINT_TRIGGER') || /\bcode 1811\b/u.test(value.message));
  return matches(error) || (error instanceof Error && matches(error.cause));
}
