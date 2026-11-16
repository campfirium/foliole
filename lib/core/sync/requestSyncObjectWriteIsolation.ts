import type { DbPort } from './dbPort.js';
import { supportsDbBatch, type DbBatchPort } from './dbStatements.js';
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
  const isolation = createRequestSyncObjectWriteIsolation();
  return {
    finish: isolation.finish,
    async write(tx: DbPort, nodeId: string, write: () => Promise<void>) {
      if (errors.has(nodeId)) return false;
      for (const parent of byNode.get(nodeId) ?? []) {
        if (!errors.has(parent)) continue;
        const [present] = await tx.query('SELECT 1 FROM nodes WHERE id = ?', [parent]);
        if (!present) {
          errors.set(nodeId, `framed_sync_node_parent_missing:${parent}`);
          return false;
        }
      }
      const result = await isolation.write(tx, async () => {
        await write();
        return afterWrite(tx, nodeId);
      }, nodeId);
      if (!result.ok) errors.set(nodeId, result.error);
      return result.ok;
    }
  };
}

const OPEN = 'SAVEPOINT request_sync_object';
const RELEASE = 'RELEASE request_sync_object';

export function createRequestSyncObjectWriteIsolation() {
  // The caller owns one serial write loop. Between objects only reads and in-memory work may occur.
  let pendingRelease = false;
  return {
    async write<T>(tx: DbPort, write: () => Promise<T>, nodeId?: string):
    Promise<{ ok: true; value: T } | { ok: false; error: string }> {
      const batched = supportsDbBatch(tx);
      if (batched && pendingRelease) await advanceSavepoint(tx);
      else await controlSavepoint(tx, OPEN);
      pendingRelease = false;
      let value: T;
      try {
        value = await write();
      } catch (error) {
        const rejection = readObjectRejection(error, nodeId);
        if (!rejection) throw error;
        await controlSavepoint(tx, 'ROLLBACK TO request_sync_object');
        await controlSavepoint(tx, RELEASE);
        return { ok: false, error: rejection };
      }
      if (batched) pendingRelease = true;
      else await controlSavepoint(tx, RELEASE);
      return { ok: true, value };
    },
    async finish(tx: DbPort) {
      if (!pendingRelease) return;
      await controlSavepoint(tx, RELEASE);
      pendingRelease = false;
    }
  };
}

async function advanceSavepoint(tx: DbBatchPort) {
  try { await tx.batch([{ sql: RELEASE }, { sql: OPEN }]); }
  catch (error) { throw new Error('request_sync_object_savepoint_failed', { cause: error }); }
}

function readObjectRejection(error: unknown, nodeId?: string) {
  const detail = error instanceof Error ? error.message : String(error);
  const blocked = nodeId ? `sync_node_apply_blocked:${nodeId}` : undefined;
  const dependency = readFramedSyncMissingDependency(error);
  return dependency || (nodeId && isReceivedNodeFactRejection(detail)) ? detail
    : blocked && (detail === blocked || detail.startsWith(`${blocked} while running: `)) ? blocked
      : isSqliteTriggerRejection(error) ? `${REQUEST_SYNC_WRITE_REJECTED}${detail.split(' while running: ')[0]!.slice(0, 160)}` : undefined;
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
