import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from './dbPort.js';
import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import { assertFramedSyncNodeParentDependencies } from './framedSyncNodeParentDependencies.js';
import { restoreFramedSyncNodeReadingFact } from './framedSyncNodeReadingFact.js';
import { applyFramedSyncObjectStateRecord, restoreFramedSyncObjectStateFact } from './framedSyncObjectStateFact.js';
import { applyFramedSyncRelationReviewFactsWithDbPort } from './framedSyncRelationReviewApply.js';
import { restoreVerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import { applyVerifiedSyncNodesWithDbPort } from './syncNodeVerifiedApplyExecutor.js';
import { applyConvergentVerifiedSyncNodesWithDbPort } from './syncNodeVerifiedConvergence.js';
import type { ApplySyncObjectsWithDbPortOptions } from './syncObjectApplyExecutor.js';
import { asObject, text } from './syncObjectPayloadValues.js';
import { applyVerifiedExternalDocumentInTransaction, type ExternalDocumentBody } from './syncVerifiedExternalDocumentApply.js';
import { loadVerifiedBodyRef } from './verifiedBody.js';

async function externalBody(db: DbPort, fact: CanonicalFact,
  record: ReturnType<typeof restoreFramedSyncObjectStateFact>): Promise<ExternalDocumentBody> {
  const hash = text(asObject(record).body_blob_hash);
  if (record.deleted_at || !hash) return { kind: 'absent' };
  const ref = await loadVerifiedBodyRef(db, hash);
  const descriptor = fact.blobs[0];
  if (descriptor && (!ref || bytesToHex(descriptor.sha256) !== hash || BigInt(ref.byteLength) !== descriptor.byteLength)) {
    throw new Error('framed_sync_verified_body_unavailable');
  }
  return ref ? { kind: 'readable', ref } : { kind: 'unavailable', hash };
}

/** Bodies are adopted from their ready owner inside the enclosing host business transaction. */
export async function applyVerifiedFramedFactUnit(db: DbPort, facts: readonly CanonicalFact[], options: {
  operation?: 'local_restore'; objectOptions?: ApplySyncObjectsWithDbPortOptions;
} = {}) {
  const first = facts[0];
  assertBusinessUnit(facts);
  const result = await applyVerifiedFramedFactUnits(db, [facts], options);
  return { ...result, globalId: first!.globalId, objectType: first!.objectType };
}

function assertBusinessUnit(facts: readonly CanonicalFact[]) {
  const first = facts[0];
  if (!first || facts.some((fact) => fact.globalId !== first.globalId || fact.objectType !== first.objectType ||
    ![1, 2, 3, 4].includes(fact.kind))) throw new Error('framed_sync_process_fact_set_invalid');
}

/** Restore/adoption keeps the original all-node, relation/review, then state phases in one transaction. */
export async function applyVerifiedFramedFactUnits(db: DbPort, units: readonly (readonly CanonicalFact[])[], options: {
  operation?: 'local_restore'; objectOptions?: ApplySyncObjectsWithDbPortOptions;
} = {}) {
  units.forEach(assertBusinessUnit);
  const facts = units.flatMap((unit) => [...unit]);
  return db.transaction(async (tx) => {
    const nodes = [];
    for (const fact of facts) if (fact.kind === 2) nodes.push(await restoreVerifiedFramedSyncNode(tx, fact));
    await assertFramedSyncNodeParentDependencies(tx, nodes.filter((node) => node.body.kind === 'readable').map((node) => node.metadata));
    let generatedChanges = false;
    if (nodes.length) {
      if (options.operation === 'local_restore') await applyVerifiedSyncNodesWithDbPort(tx, nodes, { operation: 'local_restore' });
      else generatedChanges = (await applyConvergentVerifiedSyncNodesWithDbPort(tx, nodes)).handledConflictCount > 0;
    }
    await applyFramedSyncRelationReviewFactsWithDbPort(tx, facts.filter((fact) => fact.kind === 3 || fact.kind === 4));
    for (const fact of facts) {
      if (fact.kind !== 1) continue;
      if (fact.objectType === 'node') {
        await applyFramedSyncObjectStateRecord(tx, restoreFramedSyncNodeReadingFact(fact), options.objectOptions);
      } else {
        const record = restoreFramedSyncObjectStateFact(fact);
        if (record.object_type === 'external_document') await applyVerifiedExternalDocumentInTransaction(tx,
          { ...record, object_type: 'external_document' }, await externalBody(tx, fact, record), options.objectOptions);
        else await applyFramedSyncObjectStateRecord(tx, record, options.objectOptions);
      }
    }
    return { generatedChanges };
  });
}
