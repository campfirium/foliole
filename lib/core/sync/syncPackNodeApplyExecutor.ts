import type { DbPort } from './dbPort.js';
import {
  buildSyncPackNodeAttachmentDeleteSql,
  buildSyncPackNodeAttachmentInsertSql,
  buildSyncPackNodeUpsertSql,
  type SyncPackNodeApplyOptions
} from './syncPackApplyStatements.js';
import { applySyncPackAttachmentObjectsWithDbPort } from './syncPackAttachmentObjectsExecutor.js';
import { applySyncPackContentBlobsWithDbPort } from './syncPackContentBlobsExecutor.js';
import {
  assertContiguousSyncPackCursor,
  readSyncPackCursorWithDbPort
} from './syncPackCursor.js';
import { applySyncPackExternalDocumentsWithDbPort } from './syncPackExternalDocumentsExecutor.js';
import { applySyncPackLearningObjectsWithDbPort } from './syncPackLearningObjectsExecutor.js';
import { clearConfirmedSyncPushAcksWithDbPort } from './syncPackPushAcksExecutor.js';
import { applySyncPackReviewLogWithDbPort } from './syncPackReviewLogExecutor.js';
import { applySyncPackStateRowsWithDbPort } from './syncPackStateRowsExecutor.js';
import {
  applySyncPackMetadataObjectsWithDbPort,
  applySyncPackSettingObjectsWithDbPort
} from './syncPackSyncObjectsExecutor.js';

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
  let appliedBlobCount = 0;
  let appliedReviewOpIds: string[] = [];
  if (shouldApply) {
    appliedBlobCount = await applySyncPackContentBlobsWithDbPort(port, options);
    await applySyncPackNodesWithDbPort(port, options);
    await applySyncPackExternalDocumentsWithDbPort(port, options);
    await applySyncPackSettingObjectsWithDbPort(port, options);
    await applySyncPackMetadataObjectsWithDbPort(port, options);
    await applySyncPackLearningObjectsWithDbPort(port, options);
    await applySyncPackAttachmentObjectsWithDbPort(port, options);
    appliedReviewOpIds = await applySyncPackReviewLogWithDbPort(port, options);
    appliedObjectCount = await applySyncPackStateRowsWithDbPort(port, {
      ...options,
      objectTypes: [
        'node',
        'external_document',
        'setting',
        'import_source',
        'external_folder',
        'node_reading',
        'node_review',
        'attachment',
        'pdf_page_text'
      ]
    });
  }
  await clearConfirmedSyncPushAcksWithDbPort(port, {
    incomingAlias: options.incomingAlias,
    toStateSeq: cursor.toStateSeq
  });
  return {
    applied: shouldApply,
    appliedBlobCount,
    appliedObjectCount,
    appliedReviewOpIds,
    fromStateSeq: cursor.fromStateSeq,
    toStateSeq: cursor.toStateSeq
  };
}
