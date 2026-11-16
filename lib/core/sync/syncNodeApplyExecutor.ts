import type {
  NativeSyncNodeConflictRecord,
  NativeSyncNodeRecord
} from '../../platform/nativeSyncContract.js';
import { hashTextBody } from '../database/textBodyHash.js';

import type { DbPort } from './dbPort.js';
import type { SyncNodeAnchorRepairRecord, SyncNodeAnchorUnmappedRecord } from './syncNodeAnchorRepair.js';
import { applyIncomingRecord, loadLocalNodeSyncState } from './syncNodeApplyProjection.js';
import { decideIncomingNodeApply, latestBranchHeadRecords, orderNodesForApply, type SyncNodeApplyOperation } from './syncNodeApplyRules.js';
import { toSyncNodeConflictRecord } from './syncNodeConflictRecord.js';
import { prepareSyncNodeTextBodyHashes } from './syncNodePreparedTextBodyHashes.js';
import { arraySyncNodeRecordSource, type SyncNodeRecordMetadata, type SyncNodeRecordSource } from './syncNodeRecordSource.js';
import { prepareIncomingNodeVersionSource, prepareIncomingVersionRetention } from './syncNodeVersionHistory.js';
import { pruneLearningRowsOrDefer, type DeferredVisibilityPruning } from './syncNodeVisibilityPruning.js';

export interface ApplySyncNodesWithDbPortResult {
  appliedIds: string[];
  workspaceScopeExpanded: boolean;
  anchorRepairRecords: SyncNodeAnchorRepairRecord[];
  blockedIds: string[];
  conflictRecords: NativeSyncNodeConflictRecord[];
  conflictNodes: NativeSyncNodeRecord[];
  skippedConflictCopyIds: string[];
  tombstoneBlockedIds: string[];
  unmappedAnchorRecords: SyncNodeAnchorUnmappedRecord[];
}

export interface ApplySyncNodesWithDbPortOptions {
  editingBranch?: boolean;
  enqueueSearchInvalidations?: boolean;
  deferBodyRetirement?: boolean;
  hashTextBody?: (content: string) => Promise<string> | string;
  includeAlreadyApplied?: boolean;
  operation?: SyncNodeApplyOperation;
  visibilityPruning?: DeferredVisibilityPruning;
  isolateNodeWrites?: (tx: DbPort, nodeId: string, write: () => Promise<void>) => Promise<boolean>;
  attachmentOnlyNodeIds?: Iterable<string>;
  resolveNodeConflicts?: (tx: DbPort, conflicts: readonly SyncNodeRecordMetadata[]) => Promise<void>;
}

function assertLocalRestoreApplied(
  operation: SyncNodeApplyOperation | undefined,
  appliedCount: number,
  expectedCount: number
) {
  if (operation === 'local_restore' && appliedCount !== expectedCount) {
    throw new Error('local_restore_not_applied');
  }
}

async function assertLocalRestoreCanApply(
  port: DbPort,
  operation: SyncNodeApplyOperation | undefined,
  records: readonly SyncNodeRecordMetadata[]
) {
  if (operation !== 'local_restore') return;
  for (const record of records) {
    const localNode = await loadLocalNodeSyncState(port, record.object_id);
    const decision = decideIncomingNodeApply(localNode, record, operation);
    if (decision === 'block_incoming' || decision === 'record_conflict') {
      throw new Error('local_restore_not_applied');
    }
  }
}

export async function applySyncNodesWithDbPort(
  port: DbPort,
  records: NativeSyncNodeRecord[],
  options: ApplySyncNodesWithDbPortOptions = {}
): Promise<ApplySyncNodesWithDbPortResult> {
  const result = await applySyncNodeSourceWithDbPort(port, arraySyncNodeRecordSource(records), options);
  return { ...result, conflictRecords: result.conflictNodes.map(toSyncNodeConflictRecord) };
}

export type ApplySyncNodeSourceResult<M extends SyncNodeRecordMetadata> =
  Omit<ApplySyncNodesWithDbPortResult, 'conflictNodes' | 'conflictRecords'> & { conflictNodes: M[] };

export async function applySyncNodeSourceWithDbPort<M extends SyncNodeRecordMetadata>(
  port: DbPort, source: SyncNodeRecordSource<M>, options: ApplySyncNodesWithDbPortOptions = {}, historySource = source
): Promise<ApplySyncNodeSourceResult<M>> {
  const result = emptyNodeApplyResult<M>();
  const ordered = orderNodesForApply(latestBranchHeadRecords(source.records.filter((record) => !source.isIdentityOnly(record))));
  const remoteNodeIdsInBatch = new Set(ordered.map((record) => record.object_id));
  const invalidatedAt = new Date().toISOString();
  await assertLocalRestoreCanApply(port, options.operation, ordered);
  const preparedHashes = new Map<M, string>();
  for (const metadata of ordered) {
    if (metadata.snapshot.body_blob_hash) continue;
    const record = await source.load(port, metadata);
    const hash = (await prepareSyncNodeTextBodyHashes([record], options)).get(record);
    if (hash) preparedHashes.set(metadata, hash);
  }
  await port.transaction(async (tx) => {
    const history = await prepareIncomingNodeVersionSource(tx, historySource);
    const retain = await prepareIncomingVersionRetention(tx, history);
    async function applyRecords(records: readonly M[], versions: readonly M[], target: ApplySyncNodeSourceResult<M>) {
      const retained = await retain(tx, historySource, versions, options.deferBodyRetirement ?? false);
      for (const metadata of records) {
        const record = await source.load(tx, metadata);
        const retention = retained.get(metadata);
        const content = record.body_text ?? record.snapshot.content;
        const versionAlreadyRetained = retention === 'complete' || (retention === 'verify_body_hash' &&
          typeof content === 'string' && hashTextBody(content) === record.snapshot.body_blob_hash);
        if (await applyIncomingRecord({ tx, record, result: target, options, invalidatedAt, remoteNodeIdsInBatch,
          preparedTextBodyHash: preparedHashes.get(metadata), versionAlreadyRetained })) {
          target.conflictNodes.push(metadata);
        }
      }
    }
    await applyPreparedNodeGroups(tx, ordered, history, options, result, applyRecords);
    assertLocalRestoreApplied(options.operation, result.appliedIds.length, ordered.length);
    if (result.appliedIds.length > 0) {
      result.workspaceScopeExpanded = await pruneLearningRowsOrDefer(tx, options.visibilityPruning);
    }
  });
  return result;
}

function emptyNodeApplyResult<M extends SyncNodeRecordMetadata>(): ApplySyncNodeSourceResult<M> {
  return { workspaceScopeExpanded: false, appliedIds: [], anchorRepairRecords: [], blockedIds: [], conflictNodes: [],
    skippedConflictCopyIds: [], tombstoneBlockedIds: [], unmappedAnchorRecords: [] };
}

async function applyPreparedNodeGroups<M extends SyncNodeRecordMetadata>(tx: DbPort, records: readonly M[], history: readonly M[],
  options: ApplySyncNodesWithDbPortOptions, result: ApplySyncNodeSourceResult<M>,
  write: (records: readonly M[], history: readonly M[], target: ApplySyncNodeSourceResult<M>) => Promise<void>) {
  const isolate = options.isolateNodeWrites;
  if (!isolate) return write(records, history, result);
  const byNode = (values: readonly M[]) => {
    const groups = new Map<string, M[]>();
    for (const value of values) {
      const group = groups.get(value.object_id);
      if (group) group.push(value);
      else groups.set(value.object_id, [value]);
    }
    return groups;
  };
  const projections = byNode(records);
  const versions = byNode(history);
  for (const id of new Set([...projections.keys(), ...versions.keys(), ...options.attachmentOnlyNodeIds ?? []])) {
    const target = emptyNodeApplyResult<M>();
    const success = await isolate(tx, id, async () => {
      await write(projections.get(id) ?? [], versions.get(id) ?? [], target);
      if (target.blockedIds.length) throw new Error(`sync_node_apply_blocked:${id}`);
      if (target.conflictNodes.length) await options.resolveNodeConflicts?.(tx, target.conflictNodes);
    });
    if (!success) continue;
    for (const key of ['appliedIds', 'blockedIds', 'skippedConflictCopyIds', 'tombstoneBlockedIds'] as const) {
      result[key].push(...target[key]);
    }
    result.conflictNodes.push(...target.conflictNodes);
    result.anchorRepairRecords.push(...target.anchorRepairRecords);
    result.unmappedAnchorRecords.push(...target.unmappedAnchorRecords);
  }
}
