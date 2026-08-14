import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';

interface AlternativeState extends DbRow {
  alternative_id: string;
  body_text: string;
  created_at: string;
  node_id: string;
  source_device_id: string;
  source_version_id: string;
  status: 'available' | 'dismissed' | 'promoted' | 'superseded';
}

export async function chooseEvidenceProjection(
  port: DbPort,
  local: NativeSyncNodeRecord,
  incoming: NativeSyncNodeRecord,
  baseBody: string
) {
  const [localAnchors, incomingAnchors] = await Promise.all([
    countAnchoredDescendants(port, local.object_id, local.version_id),
    countAnchoredDescendants(port, incoming.object_id, incoming.version_id)
  ]);
  const winner = chooseProjection(local, incoming, baseBody, localAnchors, incomingAnchors);
  const loser = winner === local ? incoming : local;
  return { body: winner.body_text ?? winner.snapshot.content ?? '', loser, winner };
}

export function chooseProjection(
  local: NativeSyncNodeRecord,
  incoming: NativeSyncNodeRecord,
  baseBody: string,
  localAnchors: number,
  incomingAnchors: number
) {
  if (localAnchors !== incomingAnchors) return localAnchors > incomingAnchors ? local : incoming;
  const localBody = local.body_text ?? local.snapshot.content ?? '';
  const incomingBody = incoming.body_text ?? incoming.snapshot.content ?? '';
  const localDelta = Math.abs(localBody.length - baseBody.length);
  const incomingDelta = Math.abs(incomingBody.length - baseBody.length);
  if (localDelta !== incomingDelta) return localDelta > incomingDelta ? local : incoming;
  if (localBody.length !== incomingBody.length) return localBody.length > incomingBody.length ? local : incoming;
  const localKey = `${local.version_created_at ?? ''}\n${local.version_id ?? ''}`;
  const incomingKey = `${incoming.version_created_at ?? ''}\n${incoming.version_id ?? ''}`;
  return localKey >= incomingKey ? local : incoming;
}

export function buildResolutionRecord(
  records: NativeSyncNodeRecord[],
  winner: NativeSyncNodeRecord,
  body: string
): NativeSyncNodeRecord {
  const parents = [...new Set(records.map((record) => record.version_id!))].sort();
  const identity = hashText(`${winner.object_id}\n${parents.join('\n')}\n${hashText(body)}`);
  const createdAt = nextResolutionTimestamp(records);
  const snapshot = { ...winner.snapshot, body_blob_hash: null, content: body, updated_at: createdAt };
  return {
    ancestor_version_ids: [...new Set([...parents, ...records.flatMap((record) => record.ancestor_version_ids)])],
    body_text: body,
    content_hash: hashText(JSON.stringify({ body, snapshot })),
    device_id: 'desktop-resolution',
    object_id: winner.object_id,
    object_type: 'node',
    parent_version_id: parents[0]!,
    parent_version_ids: parents,
    snapshot,
    updated_at: createdAt,
    version_created_at: createdAt,
    version_id: `resolution#${identity.slice(0, 24)}`
  };
}

function nextResolutionTimestamp(records: NativeSyncNodeRecord[]) {
  const parentTimestamps = records.map((record) => Date.parse(record.version_created_at ?? ''));
  if (parentTimestamps.some((timestamp) => !Number.isFinite(timestamp))) {
    throw new Error('sync_resolution_timestamp_invalid');
  }
  return new Date(Math.max(...parentTimestamps) + 1).toISOString();
}

export async function storeAlternative(port: DbPort, loser: NativeSyncNodeRecord, updatedAt: string) {
  const sourceVersionId = loser.version_id!;
  const sourceDeviceId = loser.device_id ?? 'unknown';
  const alternativeId = `alternative#${hashText(`${loser.object_id}\n${sourceVersionId}`).slice(0, 24)}`;
  await supersedePreviousAlternative(port, loser.object_id, sourceDeviceId, sourceVersionId, updatedAt);
  const alternative: AlternativeState = {
    alternative_id: alternativeId,
    body_text: loser.body_text ?? loser.snapshot.content ?? '',
    created_at: loser.version_created_at ?? updatedAt,
    node_id: loser.object_id,
    source_device_id: sourceDeviceId,
    source_version_id: sourceVersionId,
    status: 'available'
  };
  await port.run(
    `INSERT INTO node_text_alternatives (
       alternative_id, node_id, source_version_id, body_text, source_device_id, created_at, status, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'available', ?)
     ON CONFLICT(alternative_id) DO NOTHING`,
    [alternativeId, alternative.node_id, sourceVersionId, alternative.body_text,
      sourceDeviceId, alternative.created_at, updatedAt]
  );
  await markAlternativeDirty(port, alternative, updatedAt);
}

async function supersedePreviousAlternative(
  port: DbPort,
  nodeId: string,
  sourceDeviceId: string,
  sourceVersionId: string,
  updatedAt: string
) {
  const previous = await port.query<AlternativeState>(
    `SELECT alternative_id, body_text, created_at, node_id, source_device_id, source_version_id, status
     FROM node_text_alternatives
     WHERE node_id = ? AND source_device_id = ? AND status = 'available' AND source_version_id <> ?`,
    [nodeId, sourceDeviceId, sourceVersionId]
  );
  await port.run(
    `UPDATE node_text_alternatives SET status = 'superseded', updated_at = ?
     WHERE node_id = ? AND source_device_id = ? AND status = 'available' AND source_version_id <> ?`,
    [updatedAt, nodeId, sourceDeviceId, sourceVersionId]
  );
  for (const alternative of previous) {
    await markAlternativeDirty(port, { ...alternative, status: 'superseded' }, updatedAt);
  }
}

async function markAlternativeDirty(
  port: DbPort,
  alternative: AlternativeState,
  updatedAt: string
) {
  const payload = JSON.stringify({ ...alternative, updated_at: updatedAt });
  await port.run(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, deleted_at, sync_dirty
     ) VALUES ('node_text_alternative', ?, (SELECT COALESCE(MAX(state_seq), 0) + 1 FROM sync_object_state), ?,
       'desktop-resolution', ?, NULL, 1)
     ON CONFLICT(object_type, object_id) DO UPDATE SET
       state_seq = excluded.state_seq, content_hash = excluded.content_hash,
       last_modified_by_device_id = excluded.last_modified_by_device_id,
       updated_at = excluded.updated_at, sync_dirty = 1`,
    [alternative.alternative_id, hashText(payload), updatedAt]
  );
}

async function countAnchoredDescendants(port: DbPort, nodeId: string, versionId: string | null) {
  const rows = await port.query<{ anchor_link: string; anchor_source_version_id: string | null }>(
    `SELECT anchor_link, anchor_source_version_id FROM nodes
     WHERE parent_id = ? AND deleted_at IS NULL AND anchor_link IS NOT NULL
       AND anchor_resolution_status = 'resolved'`,
    [nodeId]
  );
  return rows.filter((row) => !row.anchor_source_version_id || row.anchor_source_version_id === versionId).length;
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
