import {
  assertFramedSyncDigest,
  FRAMED_SYNC_LIMITS
} from './framedSyncContract.js';

type BlobDescriptor = Readonly<{
  byteLength: bigint;
  required: boolean;
  role: number;
  sha256: Uint8Array;
}>;

type FactWithBlobs = Readonly<{ blobs: readonly BlobDescriptor[] }>;
type FactIdentityDescriptor = Readonly<{
  factId: string; globalId: string; kind: number; objectType: string;
}>;

function hashKey(value: Uint8Array) {
  return [...assertFramedSyncDigest(value, 'blob_hash')]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function descriptorMatches(left: BlobDescriptor, right: BlobDescriptor) {
  return left.byteLength === right.byteLength && left.required === right.required &&
    left.role === right.role;
}

function assertDescriptor(descriptor: BlobDescriptor) {
  hashKey(descriptor.sha256);
  if (!Number.isInteger(descriptor.role) || descriptor.role < 1 || descriptor.role > 5) {
    throw new Error('canonical_blob_role_invalid');
  }
}

export function assertCanonicalFactIdentity(fact: FactIdentityDescriptor) {
  if (!Number.isInteger(fact.kind) || fact.kind < 1 || fact.kind > 8) {
    throw new Error('canonical_fact_kind_invalid');
  }
  if (!fact.objectType || !fact.globalId || !fact.factId) {
    throw new Error('canonical_fact_identity_invalid');
  }
}

export function assertUniqueCanonicalFacts(facts: readonly FactIdentityDescriptor[]) {
  for (let index = 1; index < facts.length; index += 1) {
    const left = facts[index - 1]!;
    const right = facts[index]!;
    if (left.kind === right.kind && left.objectType === right.objectType &&
        left.globalId === right.globalId && left.factId === right.factId) {
      throw new Error('canonical_fact_duplicate');
    }
  }
}

export function assertManifestBlobGraph(
  facts: readonly FactWithBlobs[],
  manifestBlobs: readonly BlobDescriptor[]
) {
  const declared = new Map(manifestBlobs.map((blob) => [hashKey(blob.sha256), blob]));
  const referenced = new Set<string>();
  let edgeCount = 0;

  for (const blob of manifestBlobs) assertDescriptor(blob);

  for (const fact of facts) {
    const factHashes = new Set<string>();
    for (const blob of fact.blobs) {
      const key = hashKey(blob.sha256);
      assertDescriptor(blob);
      edgeCount += 1;
      if (edgeCount > FRAMED_SYNC_LIMITS.maxFactBlobEdges) {
        throw new Error('canonical_fact_blob_edge_limit_exceeded');
      }
      if (factHashes.has(key)) throw new Error('canonical_fact_blob_duplicate');
      factHashes.add(key);
      const declaration = declared.get(key);
      if (!declaration) throw new Error('canonical_fact_blob_undeclared');
      if (!descriptorMatches(blob, declaration)) throw new Error('canonical_blob_descriptor_mismatch');
      referenced.add(key);
    }
  }

  if (referenced.size !== declared.size) throw new Error('canonical_blob_unreferenced');
}


export function assertTransferProposalSummary(
  factCount: number,
  blobs: readonly BlobDescriptor[],
  summary: Readonly<{ blobCount: bigint; factCount: bigint; totalBlobBytes: bigint }>
) {
  const totalBlobBytes = blobs.reduce((total, blob) => total + blob.byteLength, 0n);
  if (summary.factCount !== BigInt(factCount) || summary.blobCount !== BigInt(blobs.length) ||
      summary.totalBlobBytes !== totalBlobBytes) {
    throw new Error('transfer_proposal_summary_mismatch');
  }
  if (factCount > FRAMED_SYNC_LIMITS.maxFactsPerTransfer ||
      blobs.length > FRAMED_SYNC_LIMITS.maxBlobsPerTransfer ||
      totalBlobBytes > BigInt(FRAMED_SYNC_LIMITS.maxTransferBytes)) {
    throw new Error('transfer_proposal_limit_exceeded');
  }
}

export function requiredBlobHashes(fact: FactWithBlobs) {
  return fact.blobs.filter((blob) => blob.required).map((blob) => blob.sha256)
    .sort((left, right) => hashKey(left).localeCompare(hashKey(right)));
}
