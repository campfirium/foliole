import { bytesToHex } from '@noble/hashes/utils.js';

import { framedSyncBytes } from '../../../../../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import type {
  CanonicalBlob,
  CanonicalFact
} from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { decodeFramedExternalDocumentBodies } from '../../../../../../lib/core/sync/framedSyncExternalDocumentBody.js';
import { framedSyncMainBodyBlob, isFramedSyncNodeIdentityFact } from '../../../../../../lib/core/sync/framedSyncNodeFactContract.js';
import { restoreFramedSyncNodeReadingFact } from '../../../../../../lib/core/sync/framedSyncNodeReadingFact.js';
import { restoreFramedSyncNodeIdentityFact, restoreFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeRestore.js';
import { restoreFramedSyncObjectStateFact } from '../../../../../../lib/core/sync/framedSyncObjectStateFact.js';

import { blob, sameBlob, uniqueRows, validateResources } from './companionFramedSyncDescriptorValidation.js';
import { companionFramedResourceUnit } from './companionFramedSyncResourceApply.js';

export type DecodedCompanionTransfer = Readonly<{
  resourceFacts?: readonly CanonicalFact[];
  externalBodies?: readonly Readonly<{ hash: string; text: string }>[];
  globalId: string;
  objectType: string;
  nodes: Array<ReturnType<typeof restoreFramedSyncNodeRecord>>;
  relationReviewFacts: readonly CanonicalFact[];
  readingStates: Array<ReturnType<typeof restoreFramedSyncNodeReadingFact>>;
}>;

function decodeNode(fact: CanonicalFact, bodies: ReadonlyMap<string, DbRow>) {
  if (isFramedSyncNodeIdentityFact(fact)) return restoreFramedSyncNodeIdentityFact(fact);
  const descriptors = [framedSyncMainBodyBlob(fact)].filter((entry): entry is CanonicalBlob => Boolean(entry));
  if (descriptors.length !== 1) throw new Error('framed_sync_android_blob_identity_mismatch');
  const row = bodies.get(bytesToHex(descriptors[0]!.sha256));
  if (!row || !sameBlob(descriptors[0]!, blob(row))) {
    throw new Error('framed_sync_android_blob_identity_mismatch');
  }
  return restoreFramedSyncNodeRecord({ bodyBlob: framedSyncBytes(row, 'data'), fact,
    manifestBlob: blob(row),
    alternativeBodies: fact.blobs.filter((entry) => entry.role === 1 && entry !== descriptors[0]).map((entry) => {
      const body = bodies.get(bytesToHex(entry.sha256));
      if (!body || !sameBlob(entry, blob(body))) throw new Error('text_alternative_body_blob_invalid');
      return { hash: bytesToHex(entry.sha256), text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
        .decode(framedSyncBytes(body, 'data')) };
    }) });
}

export function decodeCompanionFramedSyncTransfer(input: {
  bodyRows: DbRow[];
  facts: CanonicalFact[];
  resourceRows: DbRow[];
  resourceStorageKeys: readonly string[];
}): DecodedCompanionTransfer {
  const resources = companionFramedResourceUnit(input.facts);
  if (resources) return { resourceFacts: input.facts, globalId: input.facts[0]!.globalId,
    objectType: input.facts[0]!.objectType, nodes: [], relationReviewFacts: [], readingStates: [] };
  const nodeFacts = input.facts.filter((fact) => fact.kind === 2);
  const relationReviewFacts = input.facts.filter((fact) => fact.kind === 3 || fact.kind === 4);
  const readingStates = input.facts.filter((fact) => fact.kind === 1)
    .map((fact) => fact.objectType === 'node' ? restoreFramedSyncNodeReadingFact(fact) : restoreFramedSyncObjectStateFact(fact));
  if (!input.facts.length || nodeFacts.length + relationReviewFacts.length + readingStates.length !== input.facts.length) {
    throw new Error('framed_sync_android_fact_set_unsupported');
  }
  const globalId = input.facts[0]!.globalId;
  const objectType = input.facts[0]!.objectType;
  if (input.facts.some((fact) => fact.objectType !== objectType || fact.globalId !== globalId)) {
    throw new Error('framed_sync_android_fact_identity_mismatch');
  }
  if (!nodeFacts.length) {
    if (input.resourceRows.length || input.resourceStorageKeys.length) {
      throw new Error('framed_sync_android_blob_set_mismatch');
    }
    const bodyRows = uniqueRows(input.bodyRows);
    for (const descriptor of input.facts.flatMap((fact) => fact.blobs)) {
      const row = bodyRows.get(bytesToHex(descriptor.sha256));
      if (!row || !sameBlob(descriptor, blob(row))) throw new Error('framed_sync_android_blob_identity_mismatch');
    }
    const externalBodies = decodeFramedExternalDocumentBodies(input.facts, input.bodyRows.map((row) => ({
      sha256: framedSyncBytes(row, 'sha256'), data: framedSyncBytes(row, 'data')
    })));
    return { externalBodies, globalId, objectType, nodes: [], relationReviewFacts, readingStates };
  }
  const bodies = uniqueRows(input.bodyRows);
  const requiredBodies = new Set(nodeFacts.flatMap((fact) => fact.blobs.filter((entry) => entry.role === 1 || entry.role === 5)
    .map((entry) => bytesToHex(entry.sha256))));
  if (bodies.size !== requiredBodies.size) throw new Error('framed_sync_android_blob_identity_mismatch');
  const nodes = nodeFacts.map((fact) => decodeNode(fact, bodies));
  validateResources(nodeFacts, nodes, input.resourceRows, input.resourceStorageKeys);
  return { globalId, objectType, nodes, relationReviewFacts, readingStates };
}
