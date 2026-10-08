import { bytesToHex } from '@noble/hashes/utils.js';

import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';

import type { DbPort } from './dbPort.js';
import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import { withFramedExternalDocumentBody } from './framedSyncExternalDocumentBody.js';
import { loadFramedSyncFrozenBody } from './framedSyncFrozenBody.js';
import { assertFramedSyncNodeParentDependencies } from './framedSyncNodeParentDependencies.js';
import { restoreFramedSyncNodeReadingFact } from './framedSyncNodeReadingFact.js';
import { framedSyncNodeRecordSource, type FramedBodyLoader } from './framedSyncNodeRecordSource.js';
import { applyFramedSyncObjectStateRecord, restoreFramedSyncObjectStateFact } from './framedSyncObjectStateFact.js';
import { applyFramedSyncRelationReviewFactsWithDbPort } from './framedSyncRelationReviewApply.js';
import { applySyncNodeSourceWithDbPort } from './syncNodeApplyExecutor.js';
import { applyConvergentSyncNodeSource } from './syncNodeConvergence.js';
import { enqueueAppliedNodeBodySearchInvalidation } from './syncNodeSearchInvalidations.js';
import type { ApplySyncObjectsWithDbPortOptions } from './syncObjectApplyExecutor.js';

export type FramedFactSource = (db: DbPort) => AsyncIterable<CanonicalFact>;

/** The ready owner fixes metadata and body bytes throughout the existing business transaction. */
export async function applyFramedFactSources(db: DbPort, sources: readonly FramedFactSource[], options: {
  operation?: 'local_restore'; objectOptions?: ApplySyncObjectsWithDbPortOptions; loadBody?: FramedBodyLoader;
  enqueueSearchInvalidations?: boolean;
} = {}) {
  return db.transaction(async (tx) => {
    const nodes: CanonicalFact[] = [];
    for (const source of sources) {
      let identity: Pick<CanonicalFact, 'globalId' | 'objectType'> | undefined;
      for await (const fact of source(tx)) {
        identity ??= { globalId: fact.globalId, objectType: fact.objectType };
        if (fact.globalId !== identity.globalId || fact.objectType !== identity.objectType ||
            ![1, 2, 3, 4].includes(fact.kind)) throw new Error('framed_sync_process_fact_set_invalid');
        if (fact.kind === 2) nodes.push(fact);
      }
      if (!identity) throw new Error('framed_sync_process_fact_set_invalid');
    }
    const nodeSource = framedSyncNodeRecordSource(nodes, options.loadBody);
    await assertFramedSyncNodeParentDependencies(tx, nodeSource.records.filter((node) => !nodeSource.isIdentityOnly(node)));
    let generatedChanges = false;
    if (nodes.length) {
      if (options.operation === 'local_restore') await applySyncNodeSourceWithDbPort(tx, nodeSource, { operation: 'local_restore' });
      else {
        const result = await applyConvergentSyncNodeSource(tx, nodeSource, { collectVersionPayloads: false });
        generatedChanges = result.handledConflictCount > 0;
        if (options.enqueueSearchInvalidations) for (const id of result.processedNodeIds) {
          await enqueueAppliedNodeBodySearchInvalidation(tx, id, new Date().toISOString());
        }
      }
    }
    for (const source of sources) for await (const fact of source(tx)) {
      if (fact.kind === 3 || fact.kind === 4) await applyFramedSyncRelationReviewFactsWithDbPort(tx, [fact]);
    }
    for (const source of sources) for await (const fact of source(tx)) {
      if (fact.kind === 1) await applyFramedStateFact(tx, fact, options.objectOptions, options.loadBody);
    }
    return { generatedChanges };
  });
}

async function applyFramedStateFact(db: DbPort, fact: CanonicalFact, options?: ApplySyncObjectsWithDbPortOptions,
  loadBody: FramedBodyLoader = loadFramedSyncFrozenBody) {
  if (fact.objectType === 'node') {
    await applyFramedSyncObjectStateRecord(db, restoreFramedSyncNodeReadingFact(fact), options);
    return;
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
  await applyFramedSyncObjectStateRecord(db, record, options);
}
