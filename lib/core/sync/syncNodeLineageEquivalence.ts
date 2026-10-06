import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';

interface VersionHashRow extends DbRow {
  content_hash: string;
  body_text: string | null;
  snapshot_json: string;
}

interface VersionIdRow extends DbRow {
  version_id: string;
}

export async function hasContentEquivalentIncomingLineage(
  port: DbPort,
  localVersionId: string | null,
  record: NativeSyncNodeRecord
) {
  if (!localVersionId) return false;
  const [local] = await port.query<VersionHashRow>(
    `SELECT content_hash, body_text, snapshot_json FROM node_sync_versions
     WHERE version_id = ? AND object_id = ? LIMIT 1`,
    [localVersionId, record.object_id]
  );
  if (!local) return false;
  const incomingLineage = new Set([
    record.version_id,
    ...record.ancestor_version_ids
  ].filter((versionId): versionId is string => Boolean(versionId)));
  const matches = await port.query<VersionIdRow>(
    `SELECT version_id FROM node_sync_versions
     WHERE object_id = ? AND content_hash = ?`,
    [record.object_id, local.content_hash]
  );
  if (matches.some((match) => incomingLineage.has(match.version_id))) return true;
  return local.body_text === record.body_text &&
    sameSharedSnapshot(JSON.parse(local.snapshot_json), record.snapshot);
}

function sameSharedSnapshot(left: unknown, right: unknown) {
  return JSON.stringify(normalizeSnapshot(left)) === JSON.stringify(normalizeSnapshot(right));
}

function normalizeSnapshot(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const ignored = new Set(['content', 'position', 'updated_at']);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !ignored.has(key))
    .map(([key, item]) => [key, item ?? null])
    .sort(([left], [right]) => left.localeCompare(right)));
}
