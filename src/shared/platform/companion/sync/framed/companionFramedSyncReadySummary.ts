import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import type { CanonicalBlob, CanonicalFact } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import type { FramedFactSource } from '../../../../../../lib/core/sync/framedSyncFactApply.js';
import { isFramedSyncNodeIdentityFact } from '../../../../../../lib/core/sync/framedSyncNodeFactContract.js';
import { restoreFramedSyncNodeReadingFact } from '../../../../../../lib/core/sync/framedSyncNodeReadingFact.js';
import { restoreFramedSyncNodeMetadata } from '../../../../../../lib/core/sync/framedSyncNodeRestore.js';
import { restoreFramedSyncObjectStateFact } from '../../../../../../lib/core/sync/framedSyncObjectStateFact.js';
import { streamFramedSyncReadyFactFrames } from '../../../../../../lib/core/sync/framedSyncReadyFactFrames.js';
import { FRAMED_SYNC_RESOURCE_FACT_KIND } from '../../../../../../lib/core/sync/framedSyncResourceFact.js';
import { replayRetiredParentOrderBodies } from '../../../../../../lib/core/sync/parentOrderBodyReplay.js';

import type { CompanionFramedSyncApplyInput } from './companionFramedSyncApply.js';
import type { CompanionResourceEntry } from './companionFramedSyncDescriptorValidation.js';

export function companionReadyFactSource(input: CompanionFramedSyncApplyInput,
  attemptId: Uint8Array): FramedFactSource {
  return async function* (db) {
    for await (const { fact } of streamFramedSyncReadyFactFrames(db, input.transferId, attemptId, input.stagingKind)) {
      yield fact;
    }
  };
}

/** Keep body descriptors and resource metadata, never ordinary decoded fact payloads. */
export async function summarizeCompanionReadyFacts(db: DbPort, source: FramedFactSource) {
  let first: Pick<CanonicalFact, 'globalId' | 'objectType' | 'kind'> | undefined;
  const bodyDescriptors: CanonicalBlob[] = [], nodeBodies: CanonicalBlob[] = [];
  const nodes: CompanionResourceEntry[] = [], resourceFacts: CanonicalFact[] = [];
  for await (const fact of source(db)) {
    first ??= { globalId: fact.globalId, objectType: fact.objectType, kind: fact.kind };
    const resourceUnit = first.kind === FRAMED_SYNC_RESOURCE_FACT_KIND;
    if (fact.globalId !== first.globalId || fact.objectType !== first.objectType) {
      throw new Error('framed_sync_android_fact_identity_mismatch');
    }
    if (!(resourceUnit ? [FRAMED_SYNC_RESOURCE_FACT_KIND] : [1, 2, 3, 4]).includes(fact.kind)) {
      throw new Error('framed_sync_android_fact_set_unsupported');
    }
    if (resourceUnit) { resourceFacts.push(fact); continue; }
    bodyDescriptors.push(...fact.blobs.filter((entry) => entry.role === 1 || entry.role === 5));
    if (fact.kind === 1) {
      if (fact.objectType === 'node') restoreFramedSyncNodeReadingFact(fact);
      else restoreFramedSyncObjectStateFact(fact);
    } else if (fact.kind === 2) {
      const node = restoreFramedSyncNodeMetadata(fact);
      nodes.push({ blobs: fact.blobs, identityOnly: isFramedSyncNodeIdentityFact(fact),
        snapshot: node.snapshot.resource_references === undefined ? {} :
          { resource_references: node.snapshot.resource_references } });
      nodeBodies.push(...fact.blobs.filter((entry) => entry.role === 1 || entry.role === 5));
    }
  }
  if (!first) throw new Error('framed_sync_android_fact_set_unsupported');
  return { ...first, nodes, resourceFacts, descriptors: nodes.length ? nodeBodies : bodyDescriptors };
}

export async function replayCompanionReadyOrderBodies(db: DbPort, source: FramedFactSource) {
  for await (const fact of source(db)) if (fact.kind === 1) {
    const record = fact.objectType === 'node' ? restoreFramedSyncNodeReadingFact(fact) : restoreFramedSyncObjectStateFact(fact);
    await replayRetiredParentOrderBodies(db, [record]);
  }
}
