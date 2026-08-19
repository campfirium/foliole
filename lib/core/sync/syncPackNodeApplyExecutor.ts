import { CORE_INDEX_SCHEMA_STATEMENTS } from '../database/coreIndexSchemaStatements.js';

import type { DbPort } from './dbPort.js';
import { pruneLearningRowsWithoutVisibleNodes } from './syncNodeVisibilityPruning.js';
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
import { applySyncPackGroupFactsWithDbPort } from './syncPackGroupFactsExecutor.js';
import { applySyncPackLearningObjectsWithDbPort } from './syncPackLearningObjectsExecutor.js';
import { applySyncPackVersionedNodesWithDbPort } from './syncPackNodeConvergence.js';
import { applySyncPackNodeVersionsWithDbPort } from './syncPackNodeVersionApplyExecutor.js';
import { clearConfirmedSyncPushAcksWithDbPort } from './syncPackPushAcksExecutor.js';
import { applySyncPackReviewLogWithDbPort } from './syncPackReviewLogExecutor.js';
import { ensureSyncPackSpecialRootParents } from './syncPackSpecialRootApply.js';
import { applySyncPackStateRowsWithDbPort } from './syncPackStateRowsExecutor.js';
import {
  applySyncPackMetadataObjectsWithDbPort,
  applySyncPackNodeTextAlternativesWithDbPort,
  applySyncPackSettingObjectsWithDbPort
} from './syncPackSyncObjectsExecutor.js';
import { applySyncPackViewStateObjectsWithDbPort } from './syncPackViewStateObjectsExecutor.js';

export interface SyncPackNodeSurfaceApplyOptions extends SyncPackNodeApplyOptions {
  currentCursor: number;
  deviceId: string;
  hostName?: string;
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

async function applySyncPackNodeRowsWithDbPort(
  port: DbPort,
  options: SyncPackNodeApplyOptions = {}
) {
  const resolvedOptions = await resolveSyncPackNodeApplyOptions(port, options);
  await ensureSyncPackSpecialRootParents(port, options.incomingAlias);
  await dropNodeIndexes(port);
  try {
    await port.run(buildSyncPackNodeUpsertSql(resolvedOptions));
  } finally {
    await createNodeIndexes(port);
  }
}

async function resolveSyncPackNodeApplyOptions(
  port: DbPort,
  options: SyncPackNodeApplyOptions
): Promise<SyncPackNodeApplyOptions> {
  if (options.incomingNodeColumns !== undefined) return options;
  return {
    ...options,
    incomingNodeColumns: await loadIncomingNodeColumns(port, options.incomingAlias ?? 'inc')
  };
}

async function loadIncomingNodeColumns(port: DbPort, alias: string) {
  const schemaName = alias.replaceAll('"', '""');
  const rows = await port.query<{ name: unknown }>(`PRAGMA "${schemaName}".table_info(nodes)`);
  return rows.map((row) => row.name).filter((name): name is string => typeof name === 'string');
}

const NODE_INDEX_NAMES = [
  'idx_nodes_parent_id',
  'idx_nodes_dirty_or_unversioned_updated',
  'idx_nodes_deleted_at',
  'idx_nodes_body_blob_hash'
] as const;

const NODE_INDEX_SCHEMA_STATEMENTS = CORE_INDEX_SCHEMA_STATEMENTS.filter((statement) => (
  NODE_INDEX_NAMES.some((indexName) => statement.includes(indexName))
));

async function dropNodeIndexes(port: DbPort) {
  for (const indexName of NODE_INDEX_NAMES) {
    await port.run(`DROP INDEX IF EXISTS ${indexName}`);
  }
}

async function createNodeIndexes(port: DbPort) {
  for (const statement of NODE_INDEX_SCHEMA_STATEMENTS) {
    await port.run(statement);
  }
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
  return {
    applied: shouldApply,
    appliedBlobCount: result.appliedBlobCount,
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
    await clearConfirmedSyncPushAcks(port, options, toStateSeq);
    return {
      appliedBlobCount: 0,
      appliedObjectCount: 0,
      appliedReviewOpIds: [] as string[],
      handledConflictCount: 0
    };
  }
  const applyOptions = options;
  await applySyncPackGroupFactsWithDbPort(port, {
    ...(options.incomingAlias === undefined ? {} : { incomingAlias: options.incomingAlias }),
    sourcePeerId: options.sourcePeerId!
  });
  const appliedBlobCount = await applySyncPackContentBlobsWithDbPort(port, applyOptions);
  const nodeConvergence = await applyVersionedNodeStage(port, options);
  const remainingNodeOptions = {
    ...applyOptions,
    excludedNodeIds: nodeConvergence.processedNodeIds
  };
  await applySyncPackNodeRowsWithDbPort(port, remainingNodeOptions);
  await applySyncPackNodeOrderRowsWithDbPort(port, remainingNodeOptions);
  await pruneLearningRowsWithoutVisibleNodes(port);
  await applySyncPackExternalDocumentsWithDbPort(port, options);
  await applySyncPackSettingObjectsWithDbPort(port, options);
  await applySyncPackMetadataObjectsWithDbPort(port, options);
  await applySyncPackNodeTextAlternativesWithDbPort(port, options);
  await applySyncPackLearningObjectsWithDbPort(port, options);
  await pruneLearningRowsWithoutVisibleNodes(port);
  await applySyncPackNodeAttachmentsWithDbPort(port, remainingNodeOptions);
  await applySyncPackViewStateObjectsWithDbPort(port, options);
  const appliedReviewOpIds = await applySyncPackReviewLogWithDbPort(port, options);
  const appliedObjectCount = await applySyncPackStateRowsWithDbPort(port, {
    ...remainingNodeOptions,
    objectTypes: SYNC_PACK_SURFACE_OBJECT_TYPES
  });
  await clearConfirmedSyncPushAcks(port, options, toStateSeq);
  return {
    appliedBlobCount,
    appliedObjectCount: appliedObjectCount + nodeConvergence.appliedNodeCount,
    appliedReviewOpIds,
    handledConflictCount: nodeConvergence.handledConflictCount
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
    options.deviceId,
    options.incomingAlias
  );
}

function clearConfirmedSyncPushAcks(
  port: DbPort,
  options: SyncPackNodeSurfaceApplyOptions,
  toStateSeq: number
) {
  return clearConfirmedSyncPushAcksWithDbPort(port, {
    ...(options.incomingAlias === undefined ? {} : { incomingAlias: options.incomingAlias }),
    sourcePeerId: options.sourcePeerId!,
    toStateSeq
  });
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
  'node_text_alternative',
  'attachment',
  'pdf_page_text',
  'view_state'
] as const;
