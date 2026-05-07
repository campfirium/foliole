import type { DbPort } from './dbPort.js';
import {
  buildSyncPackNodeAttachmentDeleteSql,
  buildSyncPackNodeAttachmentInsertSql,
  buildSyncPackNodeOrderDeleteSql,
  buildSyncPackNodeOrderUpsertSql,
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
import { applySyncPackViewStateObjectsWithDbPort } from './syncPackViewStateObjectsExecutor.js';

export interface SyncPackNodeSurfaceApplyOptions extends SyncPackNodeApplyOptions {
  currentCursor: number;
  deviceId: string;
}

export async function applySyncPackNodesWithDbPort(
  port: DbPort,
  options: SyncPackNodeApplyOptions = {}
) {
  await applySyncPackNodeRowsWithDbPort(port, options);
  await applySyncPackNodeOrderRowsWithDbPort(port, options);
  await applySyncPackNodeAttachmentsWithDbPort(port, options);
}

async function applySyncPackNodeOrderRowsWithDbPort(
  port: DbPort,
  options: SyncPackNodeApplyOptions = {}
) {
  await port.run(buildSyncPackNodeOrderDeleteSql(options));
  await port.run(buildSyncPackNodeOrderUpsertSql(options));
}

async function applySyncPackNodeRowsWithDbPort(
  port: DbPort,
  options: SyncPackNodeApplyOptions = {}
) {
  await port.run(buildSyncPackNodeUpsertSql(options));
}

async function pruneLearningRowsWithoutActiveNodes(port: DbPort) {
  await port.run(
    `DELETE FROM node_reading_device_state WHERE node_id NOT IN ` +
    `(SELECT id FROM nodes WHERE deleted_at IS NULL)`
  );
  await port.run(
    `DELETE FROM node_reading WHERE node_id NOT IN ` +
    `(SELECT id FROM nodes WHERE deleted_at IS NULL)`
  );
  await port.run(
    `DELETE FROM node_review WHERE node_id NOT IN ` +
    `(SELECT id FROM nodes WHERE deleted_at IS NULL)`
  );
}

async function applySyncPackNodeAttachmentsWithDbPort(
  port: DbPort,
  options: SyncPackNodeApplyOptions = {}
) {
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
    await applySyncPackNodeRowsWithDbPort(port, options);
    await applySyncPackNodeOrderRowsWithDbPort(port, options);
    await pruneLearningRowsWithoutActiveNodes(port);
    await applySyncPackExternalDocumentsWithDbPort(port, options);
    await applySyncPackSettingObjectsWithDbPort(port, options);
    await applySyncPackMetadataObjectsWithDbPort(port, options);
    await applySyncPackLearningObjectsWithDbPort(port, options);
    await applySyncPackAttachmentObjectsWithDbPort(port, options);
    await applySyncPackNodeAttachmentsWithDbPort(port, options);
    await applySyncPackViewStateObjectsWithDbPort(port, options);
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
        'pdf_page_text',
        'view_state'
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
