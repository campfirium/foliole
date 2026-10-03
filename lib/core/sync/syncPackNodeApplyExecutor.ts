import type { DbPort } from './dbPort.js';
import { applyPackNodeVersionDependencies } from './nodeVersionDependencies.js';
import {
  prepareInboundNodeVersionReceipt,
  recordInboundNodeVersionReceipt
} from './nodeVersionInboundReceipt.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { pruneLearningRowsWithoutVisibleNodes } from './syncNodeVisibilityPruning.js';
import {
  type SyncPackNodeApplyOptions
} from './syncPackApplyStatements.js';
import { applySyncPackContentBlobsWithDbPort } from './syncPackContentBlobsExecutor.js';
import { assertContiguousSyncPackCursor, readSyncPackCursorWithDbPort } from './syncPackCursor.js';
import { clearAppliedSyncPackDependencies, prepareSyncPackDependencies } from './syncPackDependencyApply.js';
import { stageSyncPackDependencySurface } from './syncPackDependencyPageApply.js';
import { retireObsoleteSyncPackDependencyViews } from './syncPackDependencyResume.js';
import { applySyncPackExternalDocumentsWithDbPort } from './syncPackExternalDocumentsExecutor.js';
import { applySyncPackGroupFactsWithDbPort } from './syncPackGroupFactsExecutor.js';
import { clearSyncPackKnownFactClaims, loadVerifiedSyncPackVersionIds } from './syncPackKnownFactClaims.js';
import { applySyncPackLearningObjectsWithDbPort } from './syncPackLearningObjectsExecutor.js';
import { applySyncPackNodeRowsWithDbPort } from './syncPackNodeRowsApply.js';
import { applySyncPackNodeTombstonesWithDbPort } from './syncPackNodeTombstoneExecutor.js';
import { applySyncPackNodeVersionsWithDbPort } from './syncPackNodeVersionApplyExecutor.js';
import { clearConfirmedSyncPackPushAcks } from './syncPackPushAckClear.js';
import {
  isRetiredSyncPackSourceEpoch,
  loadSyncPackReceiveProgress,
  saveSyncPackReceiveProgress,
  shouldApplySyncPackPage
} from './syncPackReceiveProgress.js';
import { runSyncPackApplyTransaction } from './syncPackRejectedFactClaims.js';
import { applyReplayPackTombstones } from './syncPackReplayApply.js';
import { enqueueSyncPackResourceArticles } from './syncPackResourceArticles.js';
import { applySyncPackReviewLogWithDbPort } from './syncPackReviewLogExecutor.js';
import { applySyncPackStateRowsWithDbPort } from './syncPackStateRowsExecutor.js';
import {
  applySyncPackMetadataObjectsWithDbPort,
  applySyncPackParentChildOrdersWithDbPort,
  applySyncPackNodeOpenStatesWithDbPort,
  applySyncPackNodeTextAlternativesWithDbPort,
  applySyncPackSettingObjectsWithDbPort
} from './syncPackSyncObjectsExecutor.js';
import { applyVersionedNodeStage } from './syncPackVersionedNodeStage.js';
import { applySyncPackViewStateObjectsWithDbPort } from './syncPackViewStateObjectsExecutor.js';

export interface SyncPackNodeSurfaceApplyOptions extends SyncPackNodeApplyOptions {
  currentCursor: number;
  expectedRestoreId?: string;
  enqueueSearchInvalidations?: boolean;
  hostName: string;
  onSettingApplied?: (port: DbPort, record: import('./syncPackSyncObjectsExecutor.js').SyncPackSyncObjectRecord) => Promise<void>;
  recordVersionReceipt?: boolean;
  sourceHostName?: string;
  sourcePeerId?: string;
}

export async function applySyncPackNodesWithDbPort(
  port: DbPort,
  options: SyncPackNodeApplyOptions = {}
) {
  await applySyncPackNodeRowsWithDbPort(port, options);
  await applySyncPackNodeVersionsWithDbPort(port, options);
}

export async function applySyncPackNodeSurfaceWithDbPort(
  port: DbPort,
  options: SyncPackNodeSurfaceApplyOptions
) {
  const cursor = await readSyncPackCursorWithDbPort(port, options.incomingAlias);
  if (options.expectedRestoreId && cursor.restoreId !== options.expectedRestoreId) {
    throw new Error('sync_group_restore_pack_mismatch');
  }
  if (cursor.dependencyPage) return stageSyncPackDependencySurface(port, { ...options, cursor });
  const [incomingCount] = await port.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ${options.incomingAlias ?? 'inc'}.sync_object_state`
  );
  const { result, shouldApply } = await runSyncPackApplyTransaction(port, options, async (tx) => {
    const scope = options.sourcePeerId
      ? await loadSyncPackReceiveProgress(tx, options.sourcePeerId) : null;
    const retired = scope && options.sourcePeerId
      ? await isRetiredSyncPackSourceEpoch(tx, scope.groupId, options.sourcePeerId, cursor.sourceEpoch) : false;
    const shouldApply = scope
      ? shouldApplySyncPackPage(cursor, scope.progress, options.currentCursor, retired)
      : assertContiguousSyncPackCursor(cursor, options.currentCursor);
    if (shouldApply && cursor.dependencyTransfers && (!scope || !options.sourcePeerId)) {
      throw new Error('sync_pack_dependency_apply_scope_missing');
    }
    const directClaimScope = shouldApply && scope && options.sourcePeerId
      ? await prepareSyncPackDependencies(tx, { cursor, groupId: scope.groupId,
        peerId: options.sourcePeerId, incomingAlias: options.incomingAlias ?? 'inc' }) : null;
    const claimScopes = cursor.dependencyTransfers ?? (directClaimScope ? [directClaimScope] : []);
    const verifiedVersionIds = shouldApply ? await loadVerifiedSyncPackVersionIds(tx, claimScopes) : [];
    const result = await applySyncPackSurfaceInTransaction(tx, { ...options, verifiedVersionIds }, shouldApply, cursor.toStateSeq);
    if (shouldApply && scope && options.sourcePeerId) {
      await enqueueSyncPackResourceArticles(tx, { groupId: scope.groupId,
        incomingAlias: options.incomingAlias ?? 'inc', peerId: options.sourcePeerId });
      await saveSyncPackReceiveProgress(tx, scope.groupId, options.sourcePeerId, cursor);
      await clearAppliedSyncPackDependencies(tx, cursor.dependencyTransfers);
      if (directClaimScope) await clearSyncPackKnownFactClaims(tx, directClaimScope);
      await retireObsoleteSyncPackDependencyViews(tx, { groupId: scope.groupId,
        peerId: options.sourcePeerId, currentCursor: cursor.toStateSeq });
    }
    if (shouldApply) await collectAppliedNodeVersions(tx, options.incomingAlias ?? 'inc');
    return { result, shouldApply };
  });
  const articles = shouldApply ? await loadIncomingArticles(port, options.incomingAlias ?? 'inc') : [];
  return {
    dependencyProgress: undefined,
    applied: shouldApply,
    frontierStateSeq: cursor.frontierStateSeq,
    sourceEpoch: cursor.sourceEpoch,
    appliedTombstoneNodeIds: result.appliedTombstoneNodeIds,
    participatingArticleIds: articles.map((row) => row.object_id),
    appliedBlobCount: result.appliedBlobCount,
    appliedGroupFactCount: result.appliedGroupFactCount,
    appliedObjectCount: result.appliedObjectCount,
    appliedReviewOpIds: result.appliedReviewOpIds,
    handledConflictCount: result.handledConflictCount,
    fromStateSeq: cursor.fromStateSeq,
    toStateSeq: cursor.toStateSeq,
    ...(shouldApply && incomingCount?.count === 0 ? { verifiedEmptyPage: true } : {})
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
  const preparedReceipt = options.recordVersionReceipt
    ? await prepareInboundNodeVersionReceipt(port, options.incomingAlias ?? 'inc') : null;
  const applyOptions = options;
  const groupFacts = await applySyncPackGroupFactsWithDbPort(port, {
    ...(options.incomingAlias === undefined ? {} : { incomingAlias: options.incomingAlias }),
    sourcePeerId: options.sourcePeerId ?? options.sourceHostName!
  });
  const appliedBlobCount = await applySyncPackContentBlobsWithDbPort(port, applyOptions);
  const appliedTombstoneNodeIds = await applySyncPackNodeTombstonesWithDbPort(
    port, options.incomingAlias, options.enqueueSearchInvalidations !== false
  );
  const nodeConvergence = await applyVersionedNodeStage(port, options);
  const remainingNodeOptions = {
    ...applyOptions,
    excludedNodeIds: nodeConvergence.processedNodeIds
  };
  await applySyncPackNodeRowsWithDbPort(port, remainingNodeOptions);
  await applySyncPackParentChildOrdersWithDbPort(port, options);
  await pruneLearningRowsWithoutVisibleNodes(port);
  await applySyncPackExternalDocumentsWithDbPort(port, options);
  await applySyncPackSettingObjectsWithDbPort(port, options);
  await applySyncPackMetadataObjectsWithDbPort(port, options);
  await applySyncPackNodeOpenStatesWithDbPort(port, options);
  await applySyncPackNodeTextAlternativesWithDbPort(port, options);
  await applySyncPackLearningObjectsWithDbPort(port, options);
  await pruneLearningRowsWithoutVisibleNodes(port);
  await applySyncPackViewStateObjectsWithDbPort(port, options);
  const appliedReviewOpIds = await applySyncPackReviewLogWithDbPort(port, options);
  const appliedObjectCount = await applySyncPackStateRowsWithDbPort(port, {
    ...remainingNodeOptions,
    objectTypes: SYNC_PACK_SURFACE_OBJECT_TYPES
  });
  await clearConfirmedSyncPackPushAcks(port, options, toStateSeq);
  await applyPackNodeVersionDependencies(port, options.incomingAlias ?? 'inc', options.sourcePeerId);
  if (preparedReceipt) await saveVersionReceipt(port, preparedReceipt, options.sourcePeerId);
  return {
    appliedBlobCount,
    appliedGroupFactCount: groupFacts.appliedFactCount,
    appliedObjectCount: appliedObjectCount + nodeConvergence.appliedNodeCount,
    appliedReviewOpIds,
    handledConflictCount: nodeConvergence.handledConflictCount,
    appliedTombstoneNodeIds
  };
}

async function loadIncomingArticles(port: DbPort, incomingAlias: string) {
  return port.query<{ object_id: string }>(`SELECT s.object_id FROM ${incomingAlias}.sync_object_state s
    JOIN ${incomingAlias}.nodes n ON n.id = s.object_id
    WHERE s.object_type = 'node' AND s.deleted_at IS NULL`);
}

async function collectAppliedNodeVersions(port: DbPort, incomingAlias: string) {
  const heads = await port.query<{ id: string }>(`SELECT id FROM ${incomingAlias}.nodes
    UNION SELECT node_id AS id FROM ${incomingAlias}.node_sync_tombstones`);
  for (const head of heads) await collectNodeVersionPayloads(port, head.id, Number.MAX_SAFE_INTEGER);
}

async function saveVersionReceipt(
  port: DbPort,
  prepared: import('./nodeVersionInboundReceipt.js').PreparedNodeVersionReceipt,
  sourcePeerId?: string
) {
  if (!sourcePeerId) throw new Error('node_version_receipt_source_missing');
  await recordInboundNodeVersionReceipt(port, prepared, sourcePeerId);
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
  'topic_daily_count',
  'node_open_state',
  'node_text_alternative',
  'parent_child_order',
  'pdf_page_text',
  'view_state'
] as const;
