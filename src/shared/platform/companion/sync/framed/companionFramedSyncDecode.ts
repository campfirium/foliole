import { bytesToHex } from '@noble/hashes/utils.js';

import {
  framedSyncBytes,
  sameFramedSyncBytes
} from '../../../../../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import type {
  CanonicalBlob,
  CanonicalFact
} from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { readFramedSyncNodeResources } from '../../../../../../lib/core/sync/framedSyncNodeResources.js';
import { restoreFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeRestore.js';

export type DecodedCompanionTransfer = Readonly<{
  globalId: string;
  nodes: Array<ReturnType<typeof restoreFramedSyncNodeRecord>>;
  relationReviewFacts: readonly CanonicalFact[];
}>;

function blob(row: DbRow): CanonicalBlob {
  const byteLength = row.byte_length;
  const role = row.role;
  const required = row.required;
  if ((typeof byteLength !== 'number' && typeof byteLength !== 'string' && typeof byteLength !== 'bigint') ||
      typeof role !== 'number' || typeof required !== 'number') throw new Error('framed_sync_blob_row_invalid');
  return { byteLength: BigInt(byteLength), required: required === 1, role,
    sha256: framedSyncBytes(row, 'sha256') };
}

function sameBlob(left: CanonicalBlob, right: CanonicalBlob) {
  return left.byteLength === right.byteLength && left.required === right.required &&
    left.role === right.role && sameFramedSyncBytes(left.sha256, right.sha256);
}

function uniqueRows(rows: DbRow[]) {
  const byHash = new Map(rows.map((row) => [bytesToHex(framedSyncBytes(row, 'sha256')), row]));
  if (byHash.size !== rows.length) throw new Error('framed_sync_android_blob_identity_mismatch');
  return byHash;
}

function decodeNode(fact: CanonicalFact, bodies: ReadonlyMap<string, DbRow>) {
  const descriptors = fact.blobs.filter((entry) => entry.role === 1);
  if (descriptors.length !== 1) throw new Error('framed_sync_android_blob_identity_mismatch');
  const row = bodies.get(bytesToHex(descriptors[0]!.sha256));
  if (!row || !sameBlob(descriptors[0]!, blob(row))) {
    throw new Error('framed_sync_android_blob_identity_mismatch');
  }
  return restoreFramedSyncNodeRecord({ bodyBlob: framedSyncBytes(row, 'data'), fact,
    manifestBlob: blob(row) });
}

function validateResources(
  facts: CanonicalFact[], nodes: DecodedCompanionTransfer['nodes'], rows: DbRow[], storageKeys: readonly string[]
) {
  const byHash = uniqueRows(rows);
  const expectedKeys = new Set<string>();
  facts.forEach((fact, index) => {
    const resourceDescriptors = fact.blobs.filter((entry) => entry.role !== 1);
    const descriptors = new Map(resourceDescriptors
      .map((entry) => [bytesToHex(entry.sha256), entry]));
    const resources = readFramedSyncNodeResources(nodes[index]!.snapshot.resource_references);
    if (descriptors.size !== resourceDescriptors.length || descriptors.size !== resources.length) {
      throw new Error('framed_sync_android_resource_identity_mismatch');
    }
    for (const resource of resources) {
      const row = byHash.get(resource.contentHash);
      const descriptor = descriptors.get(resource.contentHash);
      if (!row || !descriptor || String(row.storage_key) !== resource.storageKey ||
          descriptor.role !== resource.role || !sameBlob(descriptor, blob(row))) {
        throw new Error('framed_sync_android_resource_identity_mismatch');
      }
      expectedKeys.add(resource.storageKey);
    }
  });
  const suppliedKeys = new Set(storageKeys);
  if (byHash.size !== expectedKeys.size || suppliedKeys.size !== storageKeys.length ||
      suppliedKeys.size !== expectedKeys.size || [...expectedKeys].some((key) => !suppliedKeys.has(key))) {
    throw new Error('framed_sync_android_resource_identity_mismatch');
  }
}

export function decodeCompanionFramedSyncTransfer(input: {
  bodyRows: DbRow[];
  facts: CanonicalFact[];
  resourceRows: DbRow[];
  resourceStorageKeys: readonly string[];
}): DecodedCompanionTransfer {
  const nodeFacts = input.facts.filter((fact) => fact.kind === 2);
  const relationReviewFacts = input.facts.filter((fact) => fact.kind === 3 || fact.kind === 4);
  if (!input.facts.length || nodeFacts.length + relationReviewFacts.length !== input.facts.length) {
    throw new Error('framed_sync_android_fact_set_unsupported');
  }
  const globalId = input.facts[0]!.globalId;
  if (input.facts.some((fact) => fact.objectType !== 'node' || fact.globalId !== globalId)) {
    throw new Error('framed_sync_android_fact_identity_mismatch');
  }
  if (!nodeFacts.length) {
    if (input.bodyRows.length || input.resourceRows.length || input.resourceStorageKeys.length) {
      throw new Error('framed_sync_android_blob_set_mismatch');
    }
    return { globalId, nodes: [], relationReviewFacts };
  }
  const bodies = uniqueRows(input.bodyRows);
  const requiredBodies = new Set(nodeFacts.flatMap((fact) => fact.blobs.filter((entry) => entry.role === 1)
    .map((entry) => bytesToHex(entry.sha256))));
  if (bodies.size !== requiredBodies.size) throw new Error('framed_sync_android_blob_identity_mismatch');
  const nodes = nodeFacts.map((fact) => decodeNode(fact, bodies));
  validateResources(nodeFacts, nodes, input.resourceRows, input.resourceStorageKeys);
  return { globalId, nodes, relationReviewFacts };
}
