import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';


import type { DbPort } from './dbPort.js';
import { createOpaqueVersionRef } from './opaqueSyncRefs.js';
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
  if (localAnchors !== incomingAnchors) return localAnchors > incomingAnchors ? local : incoming;
  const localBody = local.body_text ?? local.snapshot.content ?? '';
  const incomingBody = incoming.body_text ?? incoming.snapshot.content ?? '';
  if (localBody.length !== incomingBody.length) return localBody.length > incomingBody.length ? local : incoming;
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
    normalizeResolutionSnapshot(resolvedSnapshot ?? winner.snapshot, body, createdAt)
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

function nextResolutionTimestamp(records: NativeSyncNodeRecord[]) {
  const parentTimestamps = records.map((record) => Date.parse(record.version_created_at ?? ''));
  if (parentTimestamps.some((timestamp) => !Number.isFinite(timestamp))) {
    throw new Error('sync_resolution_timestamp_invalid');
  }
  return new Date(Math.max(...parentTimestamps) + 1).toISOString();
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


function canonicalResolutionJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    return Object.fromEntries(Object.entries(entry).sort(([left], [right]) => (
      left < right ? -1 : left > right ? 1 : 0
    )));
  });
}


function normalizeResolutionSnapshot(
  snapshot: NativeSyncNodeRecord['snapshot'], body: string, updatedAt: string
): NativeSyncNodeRecord['snapshot'] {
  return {
    ...snapshot,
    anchor_resolution_status: snapshot.anchor_resolution_status ?? null,
    anchor_source_version_id: snapshot.anchor_source_version_id ?? null,
    attachments: [...snapshot.attachments].sort((left, right) => {
      const a = `${left.attachment_id}\n${left.role}`;
      const b = `${right.attachment_id}\n${right.role}`;
      return a < b ? -1 : a > b ? 1 : 0;
    }),
    body_blob_hash: null, content: body,
    enable_short_term: snapshot.enable_short_term ?? null,
    image_sources: snapshot.image_sources ?? null,
    import_content_fingerprint: snapshot.import_content_fingerprint ?? null,
    import_source_fingerprint: snapshot.import_source_fingerprint ?? null,
    manual_child_order: snapshot.manual_child_order ?? null,
    sequential_reading_enabled: snapshot.sequential_reading_enabled ?? null,
    shelved_at: snapshot.shelved_at ?? null,
    updated_at: updatedAt
  };
}
