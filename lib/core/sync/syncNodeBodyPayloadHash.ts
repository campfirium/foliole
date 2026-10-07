import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { buildCanonicalNodeSyncPayload, type NodeSyncHashInput } from '../database/nodeSyncPayload.js';
import { nodeSyncSnapshotHashMetadata } from '../database/nodeSyncSnapshotMetadata.js';

import { writeBodyJson } from './bodyJson.js';
import type { DbPort } from './dbPort.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import type { VerifiedBodyRef } from './verifiedBody.js';

/** Original node payload identity, including field order, normalizers and escaped body bytes. */
export async function hashNodePayloadWithBody(db: DbPort, metadata: Omit<NodeSyncHashInput, 'content'>, body: VerifiedBodyRef) {
  const digest = sha256.create();
  const encoder = new TextEncoder();
  const write = (text: string) => { digest.update(encoder.encode(text)); };
  const fields = buildCanonicalNodeSyncPayload({ ...metadata, content: '' });
  try {
    write('{');
    let separator = '';
    for (const [key, value] of Object.entries(fields)) {
      write(`${separator}${JSON.stringify(key)}:`);
      if (key === 'content') await writeBodyJson(db, body, write);
      else write(JSON.stringify(value));
      separator = ',';
    }
    write('}');
    return bytesToHex(digest.digest());
  } finally { digest.destroy(); }
}

/** A readable transport body alone does not prove a complete original tombstone version. */
export async function hasCompleteVerifiedTombstoneVersion(db: DbPort, record: VerifiedFramedSyncNode) {
  const { metadata, body } = record;
  if (!metadata.is_tombstone || body.kind !== 'readable' || !metadata.version_id || !metadata.host_name ||
      !metadata.version_created_at || metadata.snapshot.id !== metadata.object_id || !metadata.snapshot.deleted_at) return false;
  return await hashNodePayloadWithBody(db, nodeSyncSnapshotHashMetadata(metadata.snapshot), body.ref) === metadata.content_hash;
}
