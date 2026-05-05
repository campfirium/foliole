import type { DbPort } from './dbPort.js';
import {
  buildSyncPackNodeAttachmentDeleteSql,
  buildSyncPackNodeAttachmentInsertSql,
  buildSyncPackNodeUpsertSql,
  type SyncPackNodeApplyOptions
} from './syncPackApplyStatements.js';
import {
  assertContiguousSyncPackCursor,
  readSyncPackCursorWithDbPort
} from './syncPackCursor.js';
import { applySyncPackStateRowsWithDbPort } from './syncPackStateRowsExecutor.js';

export interface SyncPackNodeSurfaceApplyOptions extends SyncPackNodeApplyOptions {
  currentCursor: number;
  deviceId: string;
}

export async function applySyncPackNodesWithDbPort(
  port: DbPort,
  options: SyncPackNodeApplyOptions = {}
) {
  await port.run(buildSyncPackNodeUpsertSql(options));
  await port.run(buildSyncPackNodeAttachmentDeleteSql(options));
  await port.run(buildSyncPackNodeAttachmentInsertSql(options));
}

export async function applySyncPackNodeSurfaceWithDbPort(
  port: DbPort,
  options: SyncPackNodeSurfaceApplyOptions
) {
  const cursor = await readSyncPackCursorWithDbPort(port, options.incomingAlias);
  const shouldApply = assertContiguousSyncPackCursor(cursor, options.currentCursor);
  let appliedObjectCount = 0;
  if (shouldApply) {
    await applySyncPackNodesWithDbPort(port, options);
    appliedObjectCount = await applySyncPackStateRowsWithDbPort(port, options);
  }
  return {
    applied: shouldApply,
    appliedObjectCount,
    fromStateSeq: cursor.fromStateSeq,
    toStateSeq: cursor.toStateSeq
  };
}
