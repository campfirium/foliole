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

export interface SyncPackNodeSurfaceApplyOptions extends SyncPackNodeApplyOptions {
  currentCursor: number;
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
  if (shouldApply) {
    await applySyncPackNodesWithDbPort(port, options);
  }
  return {
    applied: shouldApply,
    fromStateSeq: cursor.fromStateSeq,
    toStateSeq: cursor.toStateSeq
  };
}
