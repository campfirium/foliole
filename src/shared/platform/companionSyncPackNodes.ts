import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import type { DbPort } from '../../../lib/core/sync/dbPort.js';
import { markSyncGroupRestoreApplied } from '../../../lib/core/sync/syncGroupRestoreEvents.js';
import { clearWorkgroupSyncDataForRestore } from '../../../lib/core/sync/syncGroupRestoreReset.js';
import { assertSyncPackCursorAdvance } from '../../../lib/core/sync/syncPackCursorGuard.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../../lib/core/sync/syncPackNodeApplyExecutor.js';
import type { NativeSyncPackApplyResult } from '../../../lib/platform/nativeSyncContract.js';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort.js';
import type { CompanionSyncPackCursorStore } from './companion/sync/cursor/companionSyncPackCursorStore.js';
import {
  closeCompanionDatabaseConnection,
  type CompanionSqliteConnectionManager,
  openCompanionDatabaseConnection
} from './companionSyncNodeVersions.js';

const INCOMING_PACK_ALIAS = 'inc';

export async function applyCompanionSyncPackPathWithSharedCore(
  args: {
    deviceId: string;
    expectedRestoreId?: string;
    hostName: string;
    packPath: string;
    sourcePeerId: string;
    sourceHostName?: string;
  },
  cursorStore: CompanionSyncPackCursorStore,
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
) {
  const currentCursor = args.expectedRestoreId ? 0 : await cursorStore.loadCursor();
  const result = await applyCompanionSyncPackNodesWithSharedCore({
    currentCursor: currentCursor ?? 0,
    deviceId: args.deviceId,
    ...(args.expectedRestoreId ? { expectedRestoreId: args.expectedRestoreId } : {}),
    hostName: args.hostName,
    packPath: args.packPath,
    ...(args.sourceHostName === undefined ? {} : { sourceHostName: args.sourceHostName }),
    sourcePeerId: args.sourcePeerId,
    recordVersionReceipt: true
  }, manager);
  assertSyncPackCursorAdvance({
    appliedFactCount: result.applied_group_fact_count,
    appliedObjectCount: result.applied_object_count,
    currentCursor: currentCursor ?? 0,
    handledConflictCount: result.handled_conflict_count ?? 0,
    toStateSeq: result.to_state_seq
  });
  if (result.to_state_seq > (currentCursor ?? 0)) {
    await cursorStore.saveCursor(result.to_state_seq);
  }
  return result;
}

export async function applyCompanionSyncPackNodesWithSharedCore(
  args: {
    currentCursor: number;
    deviceId: string;
    expectedRestoreId?: string;
    hostName: string;
    packPath: string;
    sourceHostName?: string;
    recordVersionReceipt?: boolean;
    sourcePeerId: string;
  },
  manager: CompanionSqliteConnectionManager = new SQLiteConnection(CapacitorSQLite)
) {
  const connection = await openCompanionDatabaseConnection(manager);
  const port = createCapacitorSqliteDbPort(connection);
  try {
    return await applyCompanionSyncPackNodesWithDbPort(args, port);
  } finally {
    await closeCompanionDatabaseConnection(manager, connection);
  }
}

export async function applyCompanionSyncPackNodesWithDbPort(
  args: {
    currentCursor: number;
    deviceId: string;
    expectedRestoreId?: string;
    hostName: string;
    packPath: string;
    sourceHostName?: string;
    recordVersionReceipt?: boolean;
    sourcePeerId: string;
  },
  port: DbPort
) {
  await port.run(`ATTACH DATABASE ${sqlString(args.packPath)} AS ${INCOMING_PACK_ALIAS}`);
  try {
    const apply = (db: DbPort) => applySyncPackNodeSurfaceWithDbPort(db, {
      currentCursor: args.currentCursor,
      ...(args.expectedRestoreId ? { expectedRestoreId: args.expectedRestoreId } : {}),
      enqueueSearchInvalidations: false,
      hostName: args.hostName,
      incomingAlias: INCOMING_PACK_ALIAS,
      ...(args.sourceHostName === undefined ? {} : { sourceHostName: args.sourceHostName }),
      sourcePeerId: args.sourcePeerId,
      recordVersionReceipt: args.recordVersionReceipt === true
    });
    const result = args.expectedRestoreId
      ? await applyRestorePack(port, args.expectedRestoreId, args.sourcePeerId, apply)
      : await apply(port);
    return {
      ...result,
      participating_article_ids: result.participatingArticleIds,
      applied_blob_count: result.appliedBlobCount,
      applied_group_fact_count: result.appliedGroupFactCount,
      applied_object_count: result.appliedObjectCount,
      appliedPackBlobCount: result.appliedBlobCount,
      appliedPackObjectCount: result.appliedObjectCount,
      applied_review_op_ids: result.appliedReviewOpIds,
      handled_conflict_count: result.handledConflictCount,
      to_state_seq: result.toStateSeq
    } satisfies NativeSyncPackApplyResult & typeof result & {
      appliedPackBlobCount: number;
      appliedPackObjectCount: number;
    };
  } finally {
    await port.run(`DETACH DATABASE ${INCOMING_PACK_ALIAS}`);
  }
}

async function applyRestorePack(
  port: DbPort, restoreId: string, sourcePeerId: string,
  apply: (db: DbPort) => ReturnType<typeof applySyncPackNodeSurfaceWithDbPort>
) {
  return port.transaction(async (tx) => {
    const [event] = await tx.query<{
      group_id: string; restore_id: string; restored_at: string;
      source_device_identity_key: string
    }>(`SELECT group_id, restore_id, restored_at, source_device_identity_key
      FROM sync_group_restore_events WHERE restore_id = ? AND applied_at IS NULL`, [restoreId]);
    if (!event || event.source_device_identity_key !== sourcePeerId) {
      throw new Error('sync_group_restore_source_mismatch');
    }
    await clearWorkgroupSyncDataForRestore(tx, restoreId);
    const applied = await apply(tx);
    await markSyncGroupRestoreApplied(tx, event);
    await tx.run(`INSERT INTO sync_peer_cursors (peer_id, stream_name, cursor_value, updated_at)
      VALUES (?, 'sync-pack-receive', ?, ?) ON CONFLICT(peer_id, stream_name) DO UPDATE SET
      cursor_value = excluded.cursor_value, updated_at = excluded.updated_at`,
    [sourcePeerId, String(applied.toStateSeq), new Date().toISOString()]);
    return applied;
  });
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
