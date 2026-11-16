import { bytesToHex } from '@noble/hashes/utils.js';

import { prepareReceivedReviewProjection, recomputeReceivedReviewsWithDb } from '../database/reviewProjection.js';
import type { WorkspaceRefreshScope } from '../database/workspaceSnapshotRefresh.js';
import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';

import type { DbPort } from './dbPort.js';
import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import { withFramedExternalDocumentBody } from './framedSyncExternalDocumentBody.js';
import { applyFramedSyncNodeChildFact, parseFramedSyncNodeChildIdentity } from './framedSyncNodeChildFact.js';
import { framedSyncNodeRecordSource, type FramedBodyLoader } from './framedSyncNodeRecordSource.js';
import { applyFramedSyncObjectStateRecord, restoreFramedSyncObjectStateFact } from './framedSyncObjectStateFact.js';
import { applyFramedSyncRelationReviewFactsWithDbPort } from './framedSyncRelationReviewApply.js';
import { appliedStateWorkspaceScope, joinWorkspaceScopes } from './framedSyncWorkspaceScope.js';
import { completeTopicAlternativeBody } from './framedTopicAlternativeBody.js';
import type { RequestSyncCurrentVersion } from './requestSyncCurrentVersion.js';
import { prepareFramedNodeApplication } from './requestSyncNodeProjectionPreparation.js';
import { isolateRequestSyncNodeWrites } from './requestSyncObjectWriteIsolation.js';
import { applySyncNodeSourceWithDbPort } from './syncNodeApplyExecutor.js';
import { applyConvergentSyncNodeSource } from './syncNodeConvergence.js';
import { enqueueAppliedNodeBodySearchInvalidation } from './syncNodeSearchInvalidations.js';
import type { DeferredVisibilityPruning } from './syncNodeVisibilityPruning.js';
import type { ApplySyncObjectsWithDbPortOptions } from './syncObjectApplyExecutor.js';
import { settleTopicAlternativesForNodes } from './topicAlternativeStore.js';

export type FramedFactSource = (db: DbPort, kinds?: readonly number[]) => AsyncIterable<CanonicalFact>;

/** The ready owner fixes metadata and body bytes throughout the existing business transaction. */
type FramedApplyOptions = {
  operation?: 'local_restore'; objectOptions?: ApplySyncObjectsWithDbPortOptions; loadBody: FramedBodyLoader;
  enqueueSearchInvalidations?: boolean;
  requireCompleteVersionGraph?: boolean;
  currentVersion?: RequestSyncCurrentVersion;
  /** Several received objects in one call: each source's object id and its trusted reference, if any. */
  currentVersions?: { sourceIds: readonly string[]; references: readonly RequestSyncCurrentVersion[] };
  visibilityPruning?: DeferredVisibilityPruning;
  rejectedNodes?: Map<string, string>;
};

export async function applyFramedFactSources(db: DbPort, sources: readonly FramedFactSource[], options: FramedApplyOptions) {
  return db.transaction(async (tx) => {
    const { nodes, attached } = await collectNodeFacts(tx, sources, options);
    const restoredSource = framedSyncNodeRecordSource(nodes, options.loadBody);
    const isolate = options.rejectedNodes && options.currentVersions;
    const { nodeSource, historySource } = await prepareFramedNodeApplication(tx, restoredSource, options);
    const associated = isolate ? prepareAssociatedNodeFacts(tx, attached, options) : null;
    let generatedChanges = false;
    let workspaceScope: WorkspaceRefreshScope = { kind: 'nodes', nodeIds: [] };
    if (nodeSource.records.length || historySource.records.length || (associated && attached.size)) {
      if (options.operation === 'local_restore') {
        await applySyncNodeSourceWithDbPort(tx, nodeSource, { operation: 'local_restore' });
        workspaceScope = { kind: 'full' };
      }
      else {
        const rejected = options.rejectedNodes;
        const result = await applyConvergentSyncNodeSource(tx, nodeSource, { collectVersionPayloads: false, deferAlternativeSettlement: true,
          ...(associated && rejected ? { rejectedNodes: rejected, attachmentOnlyNodeIds: attached.keys(),
            isolateNodeWrites: isolateRequestSyncNodeWrites(nodeSource.records, rejected, associated.apply) } : {}),
          ...(options.visibilityPruning ? { visibilityPruning: options.visibilityPruning } : {}) }, historySource);
        generatedChanges = result.handledConflictCount > 0;
        workspaceScope = result.workspaceScopeExpanded ? { kind: 'full' }
          : { kind: 'nodes', nodeIds: result.workspaceNodeIds,
            ...(result.workspaceStructureChanged ? { structure: true } : {}) };
        if (options.enqueueSearchInvalidations) for (const id of result.processedNodeIds) {
          await enqueueAppliedNodeBodySearchInvalidation(tx, id, new Date().toISOString());
        }
      }
    }
    const accepted = (nodeId: string) => !options.rejectedNodes?.has(nodeId);
    await assertCompactHistoryHasDeletion(tx, restoredSource.records.filter(record => accepted(record.object_id)));
    const acceptedSources = associated ? [] : options.currentVersions?.sourceIds.length === sources.length
      ? sources.filter((_source, index) => accepted(options.currentVersions!.sourceIds[index]!)) : sources;
    workspaceScope = await applyRelationReviewPhase(tx, acceptedSources, workspaceScope);
    const nodeIds = new Set(nodeSource.records.map(record => record.object_id).filter(accepted));
    for (const id of associated?.alternativeIds ?? []) nodeIds.add(id);
    if (associated) workspaceScope = joinWorkspaceScopes(workspaceScope, associated.scope());
    workspaceScope = await applyStatePhase(tx, acceptedSources, options, nodeIds, workspaceScope);
    const topics = await tx.query<{ id: string; body_blob_hash: string }>(`SELECT id, body_blob_hash FROM nodes
      WHERE kind = 'topic' AND deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))`, [JSON.stringify([...nodeIds])]);
    await settleTopicAlternativesForNodes(tx, topics, new Date().toISOString());
    return { generatedChanges, workspaceScope };
  });
}

function prepareAssociatedNodeFacts(tx: DbPort, attached: ReadonlyMap<string, FramedFactSource>, options: FramedApplyOptions) {
  const alternativeIds = new Set<string>();
  const recompute = prepareReceivedReviewProjection(tx);
  let applied: WorkspaceRefreshScope = { kind: 'nodes', nodeIds: [] };
  return { alternativeIds, scope: () => applied, async apply(db: DbPort, nodeId: string) {
    const source = attached.get(nodeId);
    if (!source) return;
    const ids = new Set<string>();
    const scope = await applyRelationReviewPhase(db, [source], { kind: 'nodes', nodeIds: [] }, recompute);
    applied = joinWorkspaceScopes(applied, await applyStatePhase(db, [source], options, ids, scope));
    for (const id of ids) alternativeIds.add(id);
  } };
}

async function applyStatePhase(tx: DbPort, sources: readonly FramedFactSource[], options: FramedApplyOptions,
  nodeIds: Set<string>, workspaceScope: WorkspaceRefreshScope) {
  for (const source of sources) for await (const fact of source(tx, [1])) {
    if (fact.kind !== 1) continue;
    if (fact.objectType === 'node' && parseFramedSyncNodeChildIdentity(fact.factId).objectType === 'node_text_alternative') {
      nodeIds.add(fact.globalId);
    }
    if (await applyFramedStateFact(tx, fact, options.loadBody, options.objectOptions)) {
      workspaceScope = joinWorkspaceScopes(workspaceScope, await appliedStateWorkspaceScope(tx, fact));
    }
  }
  return workspaceScope;
}

async function applyRelationReviewPhase(tx: DbPort, sources: readonly FramedFactSource[], workspaceScope: WorkspaceRefreshScope,
  recompute = (ids: ReadonlySet<string>) => recomputeReceivedReviewsWithDb(tx, ids)) {
  const pendingReviews = new Set<string>();
  for (const source of sources) for await (const fact of source(tx, [3, 4])) {
    if (fact.kind === 3 || fact.kind === 4) await applyFramedSyncRelationReviewFactsWithDbPort(tx, [fact], pendingReviews);
    if (fact.kind === 4) workspaceScope = joinWorkspaceScopes(workspaceScope, { kind: 'nodes', nodeIds: [fact.globalId] });
  }
  await recompute(pendingReviews);
  return workspaceScope;
}

async function collectNodeFacts(tx: DbPort, sources: readonly FramedFactSource[],
  options: Pick<Parameters<typeof applyFramedFactSources>[2], 'currentVersion' | 'currentVersions'>) {
  const nodes: CanonicalFact[] = [];
  const attached = new Map<string, FramedFactSource>();
  for (const [index, source] of sources.entries()) {
    let identity: Pick<CanonicalFact, 'globalId' | 'objectType'> | undefined;
    for await (const fact of source(tx)) {
      identity ??= { globalId: fact.globalId, objectType: fact.objectType };
      if (fact.globalId !== identity.globalId || fact.objectType !== identity.objectType ||
          ![1, 2, 3, 4].includes(fact.kind)) throw new Error('framed_sync_process_fact_set_invalid');
      if (fact.kind === 2) nodes.push(fact);
      else if (fact.objectType === 'node') attached.set(fact.globalId, source);
    }
    if (!identity && !options.currentVersion && !options.currentVersions?.references
      .some(reference => reference.globalId === options.currentVersions?.sourceIds[index])) {
      throw new Error('framed_sync_process_fact_set_invalid');
    }
  }
  return { nodes, attached };
}

async function applyFramedStateFact(db: DbPort, fact: CanonicalFact, loadBody: FramedBodyLoader,
  options?: ApplySyncObjectsWithDbPortOptions) {
  if (fact.objectType === 'node') {
    return applyFramedSyncNodeChildFact(db, fact, options, loadBody);
  }
  let record = restoreFramedSyncObjectStateFact(fact);
  if (record.object_type === 'node_text_alternative') record = await completeTopicAlternativeBody(db, fact, record, loadBody);
  if (record.object_type === 'external_document' && !record.deleted_at) {
    const bodies = [];
    for (const descriptor of fact.blobs) {
      if (descriptor.role !== 5 || descriptor.byteLength > BigInt(TEXT_BODY_MAX_BYTES)) throw new Error('framed_sync_external_document_body_invalid');
      const data = await loadBody(db, descriptor);
      bodies.push({ hash: bytesToHex(descriptor.sha256),
        text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data) });
    }
    record = withFramedExternalDocumentBody(record, bodies);
  }
  return applyFramedSyncObjectStateRecord(db, record, options);
}

async function assertCompactHistoryHasDeletion(db: DbPort,
  records: ReturnType<typeof framedSyncNodeRecordSource>['records']) {
  const ids = [...new Set(records.filter(record => record.snapshot.deleted_version_metadata_digest)
    .map(record => record.object_id))];
  if (!ids.length) return;
  const [invalid] = await db.query(`SELECT 1 FROM json_each(?) compact
    WHERE NOT EXISTS (SELECT 1 FROM node_sync_tombstones WHERE node_id = compact.value)
       OR EXISTS (SELECT 1 FROM nodes WHERE id = compact.value) LIMIT 1`, [JSON.stringify(ids)]);
  if (invalid) throw new Error('node_version_compact_without_deletion');
}
