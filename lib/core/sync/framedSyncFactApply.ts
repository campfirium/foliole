import { bytesToHex } from '@noble/hashes/utils.js';

import type { WorkspaceRefreshScope } from '../database/workspaceSnapshotRefresh.js';
import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';

import { flushCurrentParentOrderProjectionsWithDbPort } from './currentParentOrderStore.js';
import type { DbPort } from './dbPort.js';
import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import { withFramedExternalDocumentBody } from './framedSyncExternalDocumentBody.js';
import { applyFramedSyncNodeChildFact } from './framedSyncNodeChildFact.js';
import { assertFramedSyncNodeParentDependencies } from './framedSyncNodeParentDependencies.js';
import { framedSyncNodeRecordSource, type FramedBodyLoader } from './framedSyncNodeRecordSource.js';
import { applyFramedSyncObjectStateRecord, restoreFramedSyncObjectStateFact } from './framedSyncObjectStateFact.js';
import { applyFramedSyncRelationReviewFactsWithDbPort } from './framedSyncRelationReviewApply.js';
import { appliedStateWorkspaceScope, joinWorkspaceScopes } from './framedSyncWorkspaceScope.js';
import { withRequestSyncCurrentVersion, withRequestSyncCurrentVersions, type RequestSyncCurrentVersion } from './requestSyncCurrentVersion.js';
import { requestSyncNodeSource } from './requestSyncNodeGraph.js';
import { applySyncNodeSourceWithDbPort } from './syncNodeApplyExecutor.js';
import { applyConvergentSyncNodeSource } from './syncNodeConvergence.js';
import { enqueueAppliedNodeBodySearchInvalidation } from './syncNodeSearchInvalidations.js';
import type { DeferredVisibilityPruning } from './syncNodeVisibilityPruning.js';
import type { ApplySyncObjectsWithDbPortOptions } from './syncObjectApplyExecutor.js';

export type FramedFactSource = (db: DbPort, kinds?: readonly number[]) => AsyncIterable<CanonicalFact>;

/** The ready owner fixes metadata and body bytes throughout the existing business transaction. */
export async function applyFramedFactSources(db: DbPort, sources: readonly FramedFactSource[], options: {
  operation?: 'local_restore'; objectOptions?: ApplySyncObjectsWithDbPortOptions; loadBody: FramedBodyLoader;
  enqueueSearchInvalidations?: boolean;
  requireCompleteVersionGraph?: boolean;
  currentVersion?: RequestSyncCurrentVersion;
  /** Several received objects in one call: each source's object id and its trusted reference, if any. */
  currentVersions?: { sourceIds: readonly string[]; references: readonly RequestSyncCurrentVersion[] };
  visibilityPruning?: DeferredVisibilityPruning;
  /** Set by a batch that projects parent child orders once after all its objects. */
  parentOrderFlush?: { requested: boolean };
}) {
  return db.transaction(async (tx) => {
    const nodes = await collectNodeFacts(tx, sources, options);
    const restoredSource = framedSyncNodeRecordSource(nodes, options.loadBody);
    const validated = options.requireCompleteVersionGraph
      ? await requestSyncNodeSource(tx, restoredSource) : restoredSource;
    await assertFramedSyncNodeParentDependencies(tx, validated.records.filter(record => !validated.isIdentityOnly(record)));
    const selected = options.currentVersions
      ? await withRequestSyncCurrentVersions(tx, validated, options.currentVersions.references)
      : await withRequestSyncCurrentVersion(tx, validated, options.currentVersion);
    const hasStoredReference = selected.records.some(record => !validated.records.includes(record));
    const nodeSource = hasStoredReference ? await requestSyncNodeSource(tx, selected) : selected;
    if (hasStoredReference) await assertFramedSyncNodeParentDependencies(tx, nodeSource.records);
    let generatedChanges = false;
    let workspaceScope: WorkspaceRefreshScope = { kind: 'nodes', nodeIds: [] };
    if (nodeSource.records.length) {
      if (options.operation === 'local_restore') {
        await applySyncNodeSourceWithDbPort(tx, nodeSource, { operation: 'local_restore' });
        workspaceScope = { kind: 'full' };
      }
      else {
        const result = await applyConvergentSyncNodeSource(tx, nodeSource, { collectVersionPayloads: false,
          ...(options.visibilityPruning ? { visibilityPruning: options.visibilityPruning } : {}) });
        generatedChanges = result.handledConflictCount > 0;
        workspaceScope = result.workspaceScopeExpanded ? { kind: 'full' }
          : { kind: 'nodes', nodeIds: result.workspaceNodeIds };
        if (options.enqueueSearchInvalidations) for (const id of result.processedNodeIds) {
          await enqueueAppliedNodeBodySearchInvalidation(tx, id, new Date().toISOString());
        }
      }
    }
    for (const source of sources) for await (const fact of source(tx, [3, 4])) {
      if (fact.kind === 3 || fact.kind === 4) await applyFramedSyncRelationReviewFactsWithDbPort(tx, [fact]);
      if (fact.kind === 4) workspaceScope = joinWorkspaceScopes(workspaceScope, { kind: 'nodes', nodeIds: [fact.globalId] });
    }
    for (const source of sources) for await (const fact of source(tx, [1])) {
      if (fact.kind === 1 && await applyFramedStateFact(tx, fact, options.loadBody, options.objectOptions)) {
        workspaceScope = joinWorkspaceScopes(workspaceScope, await appliedStateWorkspaceScope(tx, fact));
      }
    }
    workspaceScope = await flushParentOrders(tx, workspaceScope, options.parentOrderFlush);
    return { generatedChanges, workspaceScope };
  });
}

async function collectNodeFacts(tx: DbPort, sources: readonly FramedFactSource[],
  options: Pick<Parameters<typeof applyFramedFactSources>[2], 'currentVersion' | 'currentVersions'>) {
  const nodes: CanonicalFact[] = [];
  for (const [index, source] of sources.entries()) {
    let identity: Pick<CanonicalFact, 'globalId' | 'objectType'> | undefined;
    for await (const fact of source(tx)) {
      identity ??= { globalId: fact.globalId, objectType: fact.objectType };
      if (fact.globalId !== identity.globalId || fact.objectType !== identity.objectType ||
          ![1, 2, 3, 4].includes(fact.kind)) throw new Error('framed_sync_process_fact_set_invalid');
      if (fact.kind === 2) nodes.push(fact);
    }
    if (!identity && !options.currentVersion && !options.currentVersions?.references
      .some(reference => reference.globalId === options.currentVersions?.sourceIds[index])) {
      throw new Error('framed_sync_process_fact_set_invalid');
    }
  }
  return nodes;
}

async function flushParentOrders(tx: DbPort, scope: WorkspaceRefreshScope, deferred?: { requested: boolean }) {
  if (deferred) {
    deferred.requested = true;
    return scope;
  }
  return await flushCurrentParentOrderProjectionsWithDbPort(tx)
    ? joinWorkspaceScopes(scope, { kind: 'nodes', nodeIds: [], structure: true }) : scope;
}

async function applyFramedStateFact(db: DbPort, fact: CanonicalFact, loadBody: FramedBodyLoader,
  options?: ApplySyncObjectsWithDbPortOptions) {
  if (fact.objectType === 'node') {
    return applyFramedSyncNodeChildFact(db, fact, options);
  }
  let record = restoreFramedSyncObjectStateFact(fact);
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
