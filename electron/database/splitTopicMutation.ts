import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import {
  replaceNodeOrder as replaceNodeOrderViaDriver,
  upsertNodeSnapshot as upsertNodeSnapshotViaDriver
} from '../../lib/core/database/nodeMutations.js';
import { migrateSplitTopicAnchors } from '../../lib/core/database/splitTopicAnchorMigration.js';
import { buildSplitTopicParts } from '../../lib/core/nodes/splitTopicModel.js';
import type {
  NativeNodeMutationPatchResult, NativePartitionBodyMutationArgs, NativeSplitTopicMutationArgs, NativeSplitTopicSourceChanged
} from '../../lib/platform/nativeNodeMutationContract.js';
import { assertFoliolePublishedDeleteAllowed } from '../foliolePublish/foliolePublishManagement.js';
import { buildPersistedNodeMutationPatch } from '../import/importNodeMutationPatch.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersions.js';
import { partitionEditedBody } from './partitionEditedBody.js';
import { recordNodeSourceDispositionWithDriver } from './sourceDispositionStates.js';
import { readSplitTopicSource } from './splitTopicPreview.js';
import { withTransaction } from './transaction.js';

type DialogSplitArgs = Exclude<NativeSplitTopicMutationArgs, { disposition: 'partition-body' }>;
type ReplaceSplitArgs = Extract<DialogSplitArgs, { disposition: 'replace' }>;
type SplitTopicSource = NonNullable<ReturnType<typeof readSplitTopicSource>>;

function buildAnchorTargets(content: string, input: ReplaceSplitArgs) {
  const parts = buildSplitTopicParts({ content, ...input.splitOptions });
  if (parts.length !== input.generatedNodes.length || parts.some((part, index) => part.body !== input.generatedNodes[index]?.content)) {
    throw new Error('split topic parts do not match the source preview');
  }
  return parts.map((part, index) => ({
    body: part.body, nodeId: input.generatedNodes[index]!.nodeId, sourceMap: part.sourceMap
  }));
}

function completeReplacement(driver: DatabaseDriver, input: ReplaceSplitArgs, source: SplitTopicSource, hostName: string) {
  const movedAnchorIds = migrateSplitTopicAnchors(driver, {
    children: source.anchors, now: input.deletedAt, sourceContent: source.preview.content,
    targets: buildAnchorTargets(source.preview.content, input)
  });
  for (const nodeId of movedAnchorIds) flushNodeSyncVersionWithDriver(driver, nodeId, hostName, input.deletedAt);
  driver.execute(
    `UPDATE nodes SET deleted_at = ?, updated_at = ?, last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`,
    [input.deletedAt, input.deletedAt, hostName, input.sourceNodeId]
  );
  recordNodeSourceDispositionWithDriver(driver, input.sourceNodeId, 'soft_deleted', input.deletedAt);
  flushNodeSyncVersionWithDriver(driver, input.sourceNodeId, hostName, input.deletedAt);
  return movedAnchorIds;
}

function commitSplitTopic(driver: DatabaseDriver, input: DialogSplitArgs, source: SplitTopicSource) {
  if (input.disposition === 'replace') assertFoliolePublishedDeleteAllowed([input.sourceNodeId]);
  const expectedParentNodeId = input.disposition === 'replace' ? input.sourceParentNodeId : input.sourceNodeId;
  if (input.generatedNodes.some((node) => node.parentNodeId !== expectedParentNodeId)) {
    throw new Error('split topic generated parent mismatch');
  }
  const mutationAt = input.disposition === 'replace' ? input.deletedAt : input.generatedNodes[0]!.updatedAt;
  const hostName = loadOrCreateDesktopHostName(mutationAt);
  for (const node of input.generatedNodes) {
    upsertNodeSnapshotViaDriver(driver, { ...node, hostName });
    flushNodeSyncVersionWithDriver(driver, node.nodeId, hostName, node.updatedAt);
  }
  replaceNodeOrderViaDriver(driver, input.nodeOrder);
  return input.disposition === 'replace' ? completeReplacement(driver, input, source, hostName) : [];
}

export function splitTopic(input: NativePartitionBodyMutationArgs): ReturnType<typeof partitionEditedBody>;
// eslint-disable-next-line no-redeclare -- The editor partition action always returns a mutation patch.
export function splitTopic(input: NativeSplitTopicMutationArgs): NativeNodeMutationPatchResult | NativeSplitTopicSourceChanged;
// eslint-disable-next-line no-redeclare -- The editor partition action always returns a mutation patch.
export function splitTopic(input: NativeSplitTopicMutationArgs): NativeNodeMutationPatchResult | NativeSplitTopicSourceChanged {
  if (input.disposition === 'partition-body') return partitionEditedBody(input);
  const { driver } = openDatabaseConnection();
  const result = withTransaction(driver, (): string[] | NativeSplitTopicSourceChanged => {
    const source = readSplitTopicSource(driver, input.sourceNodeId);
    if (!source || source.preview.revision !== input.expectedSourceRevision ||
        source.preview.parentNodeId !== input.sourceParentNodeId) {
      return { status: 'source-changed', preview: source?.preview ?? null };
    }
    return commitSplitTopic(driver, input, source);
  });
  if (!Array.isArray(result)) return result;
  const movedAnchors = result.length ? buildPersistedNodeMutationPatch(driver, result) : null;
  return {
    activeNodeId: input.activeNodeId,
    createdNodeIds: input.generatedNodes.map((node) => node.nodeId),
    deletedNodeIds: input.disposition === 'replace' ? [input.sourceNodeId] : [],
    nodeOrder: movedAnchors?.nodeOrder ?? input.nodeOrder,
    nodes: [...input.generatedNodes, ...(movedAnchors?.nodes ?? [])],
    ...(result.length ? { updatedNodeIds: result } : {})
  };
}
