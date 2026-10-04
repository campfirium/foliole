import { NEXT_SYNC_STATE_SEQ_SQL } from '../../../../../lib/core/database/syncStateSequenceSchemaStatements.js';
import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort.js';

export async function iosCompanionDeviceId(db: DbPort) {
  const row = (await db.query<DbRow>("SELECT value FROM companion_meta WHERE key = 'device_id' LIMIT 1"))[0];
  if (typeof row?.value !== 'string' || !row.value.trim()) throw new Error('Companion device identity is unavailable.');
  return row.value.trim();
}

export async function iosCompanionHostName(db: DbPort) {
  const row = (await db.query<DbRow>("SELECT value FROM companion_meta WHERE key = 'host_name' LIMIT 1"))[0];
  if (typeof row?.value !== 'string' || !row.value.trim()) throw new Error('Companion Host is unavailable.');
  return row.value.trim();
}

export async function markIosCompanionMutation(args: {
  contentHash: string;
  db: DbPort;
  hostName: string;
  objectId: string;
  objectType: string;
  skipUnchanged?: boolean;
  updatedAt: string;
}) {
  const existing = (await args.db.query<DbRow>(
    'SELECT content_hash, base_content_hash, sync_dirty FROM sync_object_state WHERE object_type = ? AND object_id = ? LIMIT 1',
    [args.objectType, args.objectId]
  ))[0];
  const contentHash = typeof existing?.content_hash === 'string' ? existing.content_hash : null;
  if (args.skipUnchanged && contentHash === args.contentHash) return;
  const baseContentHash = typeof existing?.base_content_hash === 'string' ? existing.base_content_hash : null;
  const base = Number(existing?.sync_dirty) === 1 ? baseContentHash ?? contentHash : contentHash;
  await args.db.run(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, current_version_id, content_hash, base_content_hash,
       last_modified_by_host_name, updated_at, deleted_at, sync_dirty
     ) VALUES (?, ?, ${NEXT_SYNC_STATE_SEQ_SQL}, NULL, ?, ?, ?, ?, NULL, 1)
     ON CONFLICT(object_type, object_id) DO UPDATE SET
       state_seq = excluded.state_seq, current_version_id = excluded.current_version_id,
       content_hash = excluded.content_hash, base_content_hash = excluded.base_content_hash,
       last_modified_by_host_name = excluded.last_modified_by_host_name,
       updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, sync_dirty = 1`,
    [args.objectType, args.objectId, args.contentHash, base, args.hostName, args.updatedAt]
  );
}

export async function iosCompanionContentHash(payload: unknown) {
  const bytes = new TextEncoder().encode(stableJson(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
