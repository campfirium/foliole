import type { DbPort } from './dbPort.js';
import { restoreMissingIncomingNodeOrder, restoreMissingNodeOrderFromCurrentVersions } from './syncNodeOrderRecovery.js';
import { pruneLearningRowsWithoutVisibleNodes } from './syncNodeVisibilityPruning.js';
import {
  buildSyncPackNodeAttachmentDeleteSql,
  buildSyncPackNodeAttachmentInsertSql,
  buildSyncPackNodeOrderDeleteSql,
  buildSyncPackNodeOrderUpsertSql,
  type SyncPackNodeApplyOptions
} from './syncPackApplyStatements.js';
import { applySyncPackAttachmentObjectsWithDbPort } from './syncPackAttachmentObjectsExecutor.js';
import { applySyncPackContentBlobsWithDbPort } from './syncPackContentBlobsExecutor.js';
import { assertContiguousSyncPackCursor, readSyncPackCursorWithDbPort } from './syncPackCursor.js';
import { applySyncPackExternalDocumentsWithDbPort } from './syncPackExternalDocumentsExecutor.js';
import { applySyncPackGroupFactsWithDbPort } from './syncPackGroupFactsExecutor.js';
import { applySyncPackLearningObjectsWithDbPort } from './syncPackLearningObjectsExecutor.js';
import { applySyncPackVersionedNodesWithDbPort } from './syncPackNodeConvergence.js';
import { applySyncPackNodeRowsWithDbPort } from './syncPackNodeRowsApply.js';
import { applySyncPackNodeTombstonesWithDbPort } from './syncPackNodeTombstoneExecutor.js';
import { applySyncPackNodeVersionsWithDbPort } from './syncPackNodeVersionApplyExecutor.js';
import { clearConfirmedSyncPackPushAcks } from './syncPackPushAckClear.js';
import { applySyncPackReviewLogWithDbPort } from './syncPackReviewLogExecutor.js';
import { ensureSyncPackSpecialRootParents } from './syncPackSpecialRootApply.js';
import { applySyncPackStateRowsWithDbPort } from './syncPackStateRowsExecutor.js';
import {
  applySyncPackMetadataObjectsWithDbPort,
  applySyncPackNodeOpenStatesWithDbPort,
  applySyncPackNodeTextAlternativesWithDbPort,
  applySyncPackSettingObjectsWithDbPort
} from './syncPackSyncObjectsExecutor.js';
import { applySyncPackViewStateObjectsWithDbPort } from './syncPackViewStateObjectsExecutor.js';

export interface SyncPackNodeSurfaceApplyOptions extends SyncPackNodeApplyOptions {
  currentCursor: number;
  hostName: string;
  onSettingApplied?: (port: DbPort, record: import('./syncPackSyncObjectsExecutor.js').SyncPackSyncObjectRecord) => Promise<void>;
  sourceHostName?: string;
  sourcePeerId?: string;
}

export async function applySyncPackNodesWithDbPort(
  port: DbPort,
  options: SyncPackNodeApplyOptions = {}
) {
  await applySyncPackNodeRowsWithDbPort(port, options);
  await applySyncPackNodeVersionsWithDbPort(port, options);
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
  const result = await port.transaction((tx) => applySyncPackSurfaceInTransaction(tx, options, shouldApply, cursor.toStateSeq));
  const articles = shouldApply ? await port.query<{ object_id: string }>(
    `SELECT s.object_id FROM ${options.incomingAlias ?? 'inc'}.sync_object_state s
     JOIN ${options.incomingAlias ?? 'inc'}.nodes n ON n.id = s.object_id
     WHERE s.object_type = 'node' AND s.deleted_at IS NULL`
  ) : [];
  return {
    applied: shouldApply,
    appliedTombstoneNodeIds: result.appliedTombstoneNodeIds,
    participatingArticleIds: articles.map((row) => row.object_id),
    appliedBlobCount: result.appliedBlobCount,
    appliedGroupFactCount: result.appliedGroupFactCount,
    appliedObjectCount: result.appliedObjectCount,
    appliedReviewOpIds: result.appliedReviewOpIds,
    handledConflictCount: result.handledConflictCount,
    fromStateSeq: cursor.fromStateSeq,
    toStateSeq: cursor.toStateSeq
  };
}

async function applySyncPackSurfaceInTransaction(
  port: DbPort,
  options: SyncPackNodeSurfaceApplyOptions,
  shouldApply: boolean,
  toStateSeq: number
) {
  if (!shouldApply) {
    return applyReplayPackTombstones(port, options, toStateSeq);
  }
  const applyOptions = options;
  const groupFacts = await applySyncPackGroupFactsWithDbPort(port, {
    ...(options.incomingAlias === undefined ? {} : { incomingAlias: options.incomingAlias }),
    sourcePeerId: options.sourcePeerId ?? options.sourceHostName!
  });
  const appliedBlobCount = await applySyncPackContentBlobsWithDbPort(port, applyOptions);
  const appliedTombstoneNodeIds = await applySyncPackNodeTombstonesWithDbPort(port, options.incomingAlias);
  const nodeConvergence = await applyVersionedNodeStage(port, options);
  const remainingNodeOptions = {
    ...applyOptions,
    excludedNodeIds: nodeConvergence.processedNodeIds
  };
  await applySyncPackNodeRowsWithDbPort(port, remainingNodeOptions);
  await applySyncPackNodeOrderRowsWithDbPort(port, remainingNodeOptions);
  await restoreMissingNodeOrderFromCurrentVersions(port);
  await restoreMissingIncomingNodeOrder(port, options.incomingAlias);
  await pruneLearningRowsWithoutVisibleNodes(port);
  await applySyncPackExternalDocumentsWithDbPort(port, options);
  await applySyncPackSettingObjectsWithDbPort(port, options);
  await applySyncPackMetadataObjectsWithDbPort(port, options);
  await applySyncPackNodeOpenStatesWithDbPort(port, options);
  await applySyncPackNodeTextAlternativesWithDbPort(port, options);
  await applySyncPackLearningObjectsWithDbPort(port, options);
  await pruneLearningRowsWithoutVisibleNodes(port);
  const attachmentOptions = {
    ...remainingNodeOptions,
    excludedNodeIds: nodeConvergence.processedNodeIds
      .filter((nodeId) => !nodeConvergence.newNodeIds.includes(nodeId))
  };
  await applySyncPackNodeAttachmentsWithDbPort(port, attachmentOptions);
  await applySyncPackViewStateObjectsWithDbPort(port, options);
  const appliedReviewOpIds = await applySyncPackReviewLogWithDbPort(port, options);
  const appliedObjectCount = await applySyncPackStateRowsWithDbPort(port, {
    ...remainingNodeOptions,
    objectTypes: SYNC_PACK_SURFACE_OBJECT_TYPES
  });
  await clearConfirmedSyncPackPushAcks(port, options, toStateSeq);
  return {
    appliedBlobCount,
    appliedGroupFactCount: groupFacts.appliedFactCount,
    appliedObjectCount: appliedObjectCount + nodeConvergence.appliedNodeCount,
    appliedReviewOpIds,
    handledConflictCount: nodeConvergence.handledConflictCount,
    appliedTombstoneNodeIds
  };
}

async function applyReplayPackTombstones(
  port: DbPort,
  options: SyncPackNodeSurfaceApplyOptions,
  toStateSeq: number
) {
  const appliedTombstoneNodeIds = await applySyncPackNodeTombstonesWithDbPort(port, options.incomingAlias);
  await restoreMissingNodeOrderFromCurrentVersions(port);
  await clearConfirmedSyncPackPushAcks(port, options, toStateSeq);
  return {
    appliedBlobCount: 0,
    appliedGroupFactCount: 0,
    appliedObjectCount: 0,
    appliedReviewOpIds: [] as string[],
    handledConflictCount: 0,
    appliedTombstoneNodeIds
  };
}

async function applyVersionedNodeStage(
  port: DbPort,
  options: SyncPackNodeSurfaceApplyOptions
) {
  await ensureSyncPackSpecialRootParents(port, options.incomingAlias);
  await applySyncPackAttachmentObjectsWithDbPort(port, options);
  await applySyncPackNodeRowsWithDbPort(port, {
    ...options,
    preserveExistingNodes: true
  });
  await applySyncPackNodeVersionsWithDbPort(port, options);
  return applySyncPackVersionedNodesWithDbPort(
    port,
    options.hostName,
    options.incomingAlias
  );
}

const SYNC_PACK_SURFACE_OBJECT_TYPES = [
  'node',
  'external_document',
  'setting',
  'import_source',
  'external_folder',
  'watched_folder',
  'node_reading',
  'node_review',
  'node_open_state',
  'node_text_alternative',
  'attachment',
  'pdf_page_text',
  'view_state'
] as const;
