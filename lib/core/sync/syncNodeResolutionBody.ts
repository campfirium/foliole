import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { writeBodyJson } from './bodyJson.js';
import type { DbPort } from './dbPort.js';
import type { FramedSyncNodeMetadata } from './framedSyncNodeRestore.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import { createOpaqueVersionRef } from './opaqueSyncRefs.js';
import { hashText } from './syncNodeResolution.js';
import {
  canonicalResolutionJson,
  nextResolutionTimestamp,
  normalizeResolutionMetadataSnapshot
} from './syncNodeResolutionMetadata.js';
import type { VerifiedBodyRef } from './verifiedBody.js';

/** Preserve the existing {body,snapshot.content} identity without materializing either string. */
async function resolutionContentHash(db: DbPort, body: VerifiedBodyRef, snapshot: FramedSyncNodeMetadata['snapshot']) {
  const digest = sha256.create();
  const encoder = new TextEncoder();
  const write = (text: string) => { digest.update(encoder.encode(text)); };
  try {
    write('{"body":');
    await writeBodyJson(db, body, write);
    write(',"snapshot":{');
    const fields = JSON.parse(canonicalResolutionJson({ ...snapshot, content: null })) as Record<string, unknown>;
    let separator = '';
    for (const [key, value] of Object.entries(fields)) {
      write(`${separator}${JSON.stringify(key)}:`);
      if (key === 'content') await writeBodyJson(db, body, write);
      else write(canonicalResolutionJson(value));
      separator = ',';
    }
    write('}}');
    return bytesToHex(digest.digest());
  } finally { digest.destroy(); }
}

export async function buildVerifiedResolutionRecord(
  db: DbPort,
  records: readonly VerifiedFramedSyncNode[],
  winner: VerifiedFramedSyncNode,
  body: VerifiedBodyRef,
  resolvedSnapshot?: FramedSyncNodeMetadata['snapshot']
): Promise<VerifiedFramedSyncNode> {
  const metadata = records.map((record) => record.metadata);
  const parents = [...new Set(metadata.map((record) => record.version_id!))].sort();
  const createdAt = nextResolutionTimestamp(metadata);
  const snapshot = JSON.parse(canonicalResolutionJson(
    normalizeResolutionMetadataSnapshot(resolvedSnapshot ?? winner.metadata.snapshot, createdAt)
  )) as FramedSyncNodeMetadata['snapshot'];
  const contentHash = await resolutionContentHash(db, body, snapshot);
  const identity = hashText(`${winner.metadata.object_id}\n${parents.join('\n')}\n${contentHash}`);
  return {
    body: { kind: 'readable', ref: body }, alternativeBodies: winner.alternativeBodies,
    metadata: {
      ancestor_version_ids: [...new Set([...parents, ...metadata.flatMap((record) => record.ancestor_version_ids)])].sort(),
      content_hash: contentHash, host_name: 'desktop-resolution', object_id: winner.metadata.object_id,
      object_type: 'node', parent_version_id: parents[0]!, parent_version_ids: parents, snapshot,
      updated_at: createdAt, version_created_at: createdAt, version_id: createOpaqueVersionRef(identity.slice(0, 24))
    }
  };
}
