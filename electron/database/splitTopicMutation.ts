import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import {
  replaceNodeOrder as replaceNodeOrderViaDriver,
  upsertNodeSnapshot as upsertNodeSnapshotViaDriver
} from '../../lib/core/database/nodeMutations.js';
import { migrateSplitTopicAnchors, type SplitTopicAnchorTarget } from '../../lib/core/database/splitTopicAnchorMigration.js';
import { buildSplitTopicParts } from '../../lib/core/nodes/splitTopicModel.js';
import type { NativeSplitTopicMutationArgs } from '../../lib/platform/nativeNodeMutationContract.js';
import { assertFoliolePublishedDeleteAllowed } from '../foliolePublish/foliolePublishManagement.js';
import { buildPersistedNodeMutationPatch } from '../import/importNodeMutationPatch.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersions.js';
import { partitionEditedBody } from './partitionEditedBody.js';
import { recordNodeSourceDispositionWithDriver } from './sourceDispositionStates.js';
import { withTransaction } from './transaction.js';

function assertSourceNodeMatches(input: Exclude<NativeSplitTopicMutationArgs, { disposition: 'partition-body' }>) {
  const row = openDatabaseConnection().driver.queryOne<{ id: string; parent_id: string | null }>(
    'SELECT id, parent_id FROM nodes WHERE id = ?',
    [input.sourceNodeId]
  );
  if (!row) {
    throw new Error('split topic source node not found');
  }
  if (row.parent_id !== input.sourceParentNodeId) throw new Error('split topic source parent mismatch');
}

type ReplaceSplitTopicArgs = Extract<NativeSplitTopicMutationArgs, { disposition: 'replace' }>;

/** Rebuilds the parts from the stored source body; anchors move only when they match what the renderer saved. */
function readAnchorTargets(driver: DatabaseDriver, input: ReplaceSplitTopicArgs) {
  if (!input.splitOptions) return null;
  const sourceContent = loadNodeBodyResolution(driver, input.sourceNodeId)?.content;
  if (sourceContent === undefined) return null;
  const parts = buildSplitTopicParts({ content: sourceContent, ...input.splitOptions });
  if (parts.length !== input.generatedNodes.length) return null;
  const targets: SplitTopicAnchorTarget[] = [];
  for (const [index, part] of parts.entries()) {
    const node = input.generatedNodes[index]!;
    if (node.content !== part.body) return null;
    targets.push({ body: part.body, nodeId: node.nodeId, sourceMap: part.sourceMap });
  }
  return { sourceContent, targets };
}

export function splitTopic(input: NativeSplitTopicMutationArgs) {
  if (input.disposition === 'partition-body') return partitionEditedBody(input);
  if (input.disposition === 'replace') assertFoliolePublishedDeleteAllowed([input.sourceNodeId]);
  assertSourceNodeMatches(input);
  const expectedParentNodeId = input.disposition === 'replace' ? input.sourceParentNodeId : input.sourceNodeId;
  if (input.generatedNodes.some((node) => node.parentNodeId !== expectedParentNodeId)) {
    throw new Error('split topic generated parent mismatch');
  }
  const connection = openDatabaseConnection();
  const mutationAt = input.disposition === 'replace' ? input.deletedAt : input.generatedNodes[0]!.updatedAt;
  const hostName = loadOrCreateDesktopHostName(mutationAt);
  const generatedNodeIds = input.generatedNodes.map((node) => node.nodeId);
  let movedAnchorIds: string[] = [];
  withTransaction(connection.driver, () => {
    for (const node of input.generatedNodes) {
      upsertNodeSnapshotViaDriver(connection.driver, { ...node, hostName });
      flushNodeSyncVersionWithDriver(connection.driver, node.nodeId, hostName, node.updatedAt);
    }
    replaceNodeOrderViaDriver(connection.driver, input.nodeOrder);
    if (input.disposition === 'replace') {
      const anchorTargets = readAnchorTargets(connection.driver, input);
      if (anchorTargets) {
        movedAnchorIds = migrateSplitTopicAnchors(connection.driver, { ...anchorTargets, now: mutationAt, sourceNodeId: input.sourceNodeId });
        for (const nodeId of movedAnchorIds) flushNodeSyncVersionWithDriver(connection.driver, nodeId, hostName, mutationAt);
      }
      connection.driver.execute(
        `UPDATE nodes
         SET deleted_at = ?, updated_at = ?, last_modified_by_host_name = ?, sync_dirty = 1
         WHERE id = ?`,
        [input.deletedAt, input.deletedAt, hostName, input.sourceNodeId]
      );
      recordNodeSourceDispositionWithDriver(connection.driver, input.sourceNodeId, 'soft_deleted', input.deletedAt);
      flushNodeSyncVersionWithDriver(connection.driver, input.sourceNodeId, hostName, input.deletedAt);
    }
  });
  const movedAnchors = movedAnchorIds.length ? buildPersistedNodeMutationPatch(connection.driver, movedAnchorIds) : null;
  return {
    activeNodeId: input.activeNodeId,
    createdNodeIds: generatedNodeIds,
    deletedNodeIds: input.disposition === 'replace' ? [input.sourceNodeId] : [],
    nodeOrder: movedAnchors?.nodeOrder ?? input.nodeOrder,
    nodes: [...input.generatedNodes, ...(movedAnchors?.nodes ?? [])],
    ...(movedAnchorIds.length ? { updatedNodeIds: movedAnchorIds } : {})
  };
}
