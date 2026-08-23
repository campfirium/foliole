import type { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.ts';
import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver.ts';
import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds.ts';
import {
  IOS_SYNC_PACK_CAPTURED_AT,
  IOS_SYNC_PACK_CAPTURE_OBJECT_ID,
  IOS_SYNC_PACK_CAPTURE_VERSION_ID,
  IOS_SYNC_PACK_MUTATION_AUTHOR,
  IOS_SYNC_PACK_RESTORED_AT,
  IOS_SYNC_PACK_RESTORE_VERSION_ID
} from '../../lib/platform/iosSyncPackAcceptanceContract.ts';

export function seedIosSyncPackContractRoundtrip(
  driver: ReturnType<typeof createBetterSqlite3Driver>,
  restoreNodeId: string
) {
  driver.execute(
    `INSERT INTO nodes (id, parent_id, kind, title, content, sync_dirty, created_at, updated_at)
     VALUES (?, ?, 'topic', 'iOS quick capture acceptance', 'iOS quick capture acceptance', 1, ?, ?)`,
    [IOS_SYNC_PACK_CAPTURE_OBJECT_ID, INBOX_NODE_ID, IOS_SYNC_PACK_CAPTURED_AT, IOS_SYNC_PACK_CAPTURED_AT]
  );
  flushNodeSyncVersionWithDriver(driver, IOS_SYNC_PACK_CAPTURE_OBJECT_ID, IOS_SYNC_PACK_MUTATION_AUTHOR,
    IOS_SYNC_PACK_CAPTURED_AT, IOS_SYNC_PACK_CAPTURE_VERSION_ID);
  driver.execute('UPDATE nodes SET deleted_at = NULL, sync_dirty = 1, updated_at = ? WHERE id = ?',
    [IOS_SYNC_PACK_RESTORED_AT, restoreNodeId]);
  flushNodeSyncVersionWithDriver(driver, restoreNodeId, IOS_SYNC_PACK_MUTATION_AUTHOR,
    IOS_SYNC_PACK_RESTORED_AT, IOS_SYNC_PACK_RESTORE_VERSION_ID);
}
