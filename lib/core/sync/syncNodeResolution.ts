import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';


import type { DbPort } from './dbPort.js';
import { createOpaqueVersionRef } from './opaqueSyncRefs.js';
import {
  canonicalResolutionJson,
  nextResolutionTimestamp,
  normalizeResolutionMetadataSnapshot
} from './syncNodeResolutionMetadata.js';
import { topicTextSelectionChildCount } from './topicTextSelectionChildCount.js';

export async function chooseEvidenceProjection(
  port: DbPort,
  local: NativeSyncNodeRecord,
  incoming: NativeSyncNodeRecord,
  baseBody: string
) {
  const [localAnchors, incomingAnchors] = await Promise.all([
    topicTextSelectionChildCount(port, local),
    topicTextSelectionChildCount(port, incoming)
  ]);
  const winner = chooseProjection(local, incoming, baseBody, localAnchors, incomingAnchors);
  const loser = winner === local ? incoming : local;
  return { body: winner.body_text ?? winner.snapshot.content ?? '', loser, winner };
}

export function chooseProjection(
  local: NativeSyncNodeRecord,
  incoming: NativeSyncNodeRecord,
  _baseBody: string,
  localAnchors: number,
  incomingAnchors: number
) {
  const localBody = local.body_text ?? local.snapshot.content ?? '';
  const incomingBody = incoming.body_text ?? incoming.snapshot.content ?? '';
  return chooseNodeTextProjection(local, incoming, localBody.length, incomingBody.length, localAnchors, incomingAnchors);
}

export function chooseNodeTextProjection<T extends Pick<NativeSyncNodeRecord, 'snapshot' | 'version_id' | 'version_created_at'>>(
  local: T, incoming: T, localLength: number, incomingLength: number, localAnchors: number, incomingAnchors: number
): T {
  if (localAnchors !== incomingAnchors) return localAnchors > incomingAnchors ? local : incoming;
  if (localLength !== incomingLength) return localLength > incomingLength ? local : incoming;
  const localKey = `${local.snapshot.text_selection?.created_at ?? local.version_created_at ?? ''}\n${local.snapshot.text_selection?.version_id ?? local.version_id ?? ''}`;
  const incomingKey = `${incoming.snapshot.text_selection?.created_at ?? incoming.version_created_at ?? ''}\n${incoming.snapshot.text_selection?.version_id ?? incoming.version_id ?? ''}`;
  return localKey >= incomingKey ? local : incoming;
}

export function buildResolutionRecord(
  records: NativeSyncNodeRecord[],
  winner: NativeSyncNodeRecord,
  body: string,
  resolvedSnapshot?: NativeSyncNodeRecord['snapshot']
): NativeSyncNodeRecord {
  const parents = [...new Set(records.map((record) => record.version_id!))].sort();
  const createdAt = nextResolutionTimestamp(records);
  const snapshot = JSON.parse(canonicalResolutionJson(
    { ...normalizeResolutionMetadataSnapshot(resolvedSnapshot ?? winner.snapshot, createdAt), content: body }
  )) as NativeSyncNodeRecord['snapshot'];
  const contentHash = hashText(canonicalResolutionJson({ body, snapshot }));
  const identity = hashText(`${winner.object_id}\n${parents.join('\n')}\n${contentHash}`);
  return {
    ancestor_version_ids: [...new Set([...parents, ...records.flatMap((record) => record.ancestor_version_ids)])].sort(),
    body_text: body,
    content_hash: contentHash,
    host_name: 'desktop-resolution',
    object_id: winner.object_id,
    object_type: 'node',
    parent_version_id: parents[0]!,
    parent_version_ids: parents,
    snapshot,
    updated_at: createdAt,
    version_created_at: createdAt,
    version_id: createOpaqueVersionRef(identity.slice(0, 24))
  };
}

export function semanticSnapshot(snapshot: NativeSyncNodeRecord['snapshot']) {
  const transientKeys = new Set(['created_at', 'updated_at', 'id']);
  return JSON.stringify(Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => !transientKeys.has(key))
  ));
}

export function hashText(value: string) {
  return bytesToHex(sha256(new TextEncoder().encode(value)));
}
