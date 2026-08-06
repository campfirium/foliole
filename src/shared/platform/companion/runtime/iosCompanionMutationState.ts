import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';

export async function iosCompanionDeviceId(db: DbPort) {
  const row = (await db.query<DbRow>("SELECT value FROM companion_meta WHERE key = 'device_id' LIMIT 1"))[0];
  if (typeof row?.value !== 'string' || !row.value.trim()) throw new Error('iOS companion device identity is unavailable.');
  return row.value.trim();
}

export async function markIosCompanionMutation(args: {
  contentHash: string;
  db: DbPort;
  deviceId: string;
  objectId: string;
  objectType: string;
  updatedAt: string;
}) {
  const existing = (await args.db.query<DbRow>(
    'SELECT content_hash, base_content_hash, sync_dirty FROM sync_object_state WHERE object_type = ? AND object_id = ? LIMIT 1',
    [args.objectType, args.objectId]
  ))[0];
  const contentHash = typeof existing?.content_hash === 'string' ? existing.content_hash : null;
  const baseContentHash = typeof existing?.base_content_hash === 'string' ? existing.base_content_hash : null;
  const base = Number(existing?.sync_dirty) === 1 ? baseContentHash ?? contentHash : contentHash;
  await args.db.run(
    `INSERT OR REPLACE INTO sync_object_state (
       object_type, object_id, state_seq, current_version_id, content_hash, base_content_hash,
       last_modified_by_device_id, updated_at, deleted_at, sync_dirty
     ) VALUES (?, ?, COALESCE((SELECT MAX(state_seq) + 1 FROM sync_object_state), 1), NULL, ?, ?, ?, ?, NULL, 1)`,
    [args.objectType, args.objectId, args.contentHash, base, args.deviceId, args.updatedAt]
  );
  await args.db.run('DELETE FROM sync_push_ack WHERE object_type = ? AND object_id = ?', [args.objectType, args.objectId]);
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
