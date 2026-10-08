import type { DbPort } from './dbPort.js';
import { ensureFramedSyncMissingResourceDemand, type FramedSyncResourceDemandKey } from './framedSyncResourceDemands.js';
import { loadNodeOwnedArticleResourceNeeds } from './nodeOwnedArticleResourceNeeds.js';

type Receiver = Pick<FramedSyncResourceDemandKey, 'groupId' | 'receiverDeviceId' | 'receiverLibraryEpoch'>;
type Current = { version_id: string | null; body_hash: string | null; version_body_hash: string | null;
  deleted_at: string | null };
type Input = { db: DbPort; receiver: Receiver; globalIds: Iterable<string> | AsyncIterable<string>;
  isPresent: (storageKey: string) => Promise<boolean>; createId: () => string };
const identity = (receiver: Receiver, globalId: string) =>
  [receiver.groupId, receiver.receiverDeviceId, receiver.receiverLibraryEpoch, globalId];
const scope = 'group_id = ? AND receiver_device_id = ? AND receiver_library_epoch = ? AND global_id = ?';

async function scanNode(tx: DbPort, input: Input, globalId: string) {
  const [node] = await tx.query<Current>(`SELECT n.current_version_id AS version_id,
    n.body_blob_hash AS body_hash, json_extract(v.snapshot_json, '$.body_blob_hash') AS version_body_hash,
    n.deleted_at FROM nodes n LEFT JOIN node_sync_versions v
      ON v.version_id = n.current_version_id AND v.object_id = n.id WHERE n.id = ?`, [globalId]);
  if (!node || node.deleted_at) {
    await tx.run(`UPDATE framed_sync_resource_demands SET state = 'no_longer_required'
      WHERE ${scope} AND state = 'pending' AND request_started = 0`, identity(input.receiver, globalId));
    return { scanned: 0, missing: 0, unavailable: 0 };
  }
  const resources = await loadNodeOwnedArticleResourceNeeds(tx, [globalId]);
  if (!node.version_id || !node.body_hash || node.version_body_hash !== node.body_hash || resources.unreadableArticleIds.length) {
    return { scanned: 0, missing: 0, unavailable: 1 };
  }
  await tx.run('CREATE TEMP TABLE framed_sync_current_resource_keys (storage_key TEXT PRIMARY KEY NOT NULL)');
  try {
    const remember = async (key: string) => { await tx.run(
      'INSERT OR IGNORE INTO temp.framed_sync_current_resource_keys VALUES (?)', [key]); };
    for (const resource of resources.needs) await remember(resource.storageKey);
    await tx.run(`UPDATE framed_sync_resource_demands SET state = 'no_longer_required'
      WHERE ${scope} AND state = 'pending' AND request_started = 0 AND
        (version_id != ? OR body_hash != ? OR NOT EXISTS (SELECT 1
          FROM temp.framed_sync_current_resource_keys keys WHERE keys.storage_key = framed_sync_resource_demands.storage_key))`,
    [...identity(input.receiver, globalId), node.version_id, node.body_hash]);
    const missing = await checkFiles(tx, input, { ...input.receiver, globalId, versionId: node.version_id, bodyHash: node.body_hash });
    return { scanned: 1, missing, unavailable: 0 };
  } finally { await tx.run('DROP TABLE temp.framed_sync_current_resource_keys'); }
}

async function checkFiles(tx: DbPort, input: Input, binding: Omit<FramedSyncResourceDemandKey, 'storageKey'>) {
  let after = '';
  let missing = 0;
  for (;;) {
    const [row] = await tx.query<{ storage_key: string }>(`SELECT storage_key
      FROM temp.framed_sync_current_resource_keys WHERE storage_key > ? ORDER BY storage_key LIMIT 1`, [after]);
    if (!row) return missing;
    after = row.storage_key;
    if (await input.isPresent(after)) continue;
    await ensureFramedSyncMissingResourceDemand(tx, { ...binding, storageKey: after }, input.createId);
    missing += 1;
  }
}

/** Call for every authorized current node, including nodes with no database difference. */
export async function scanFramedSyncResourceNeeds(input: Input) {
  const result = { scanned: 0, missing: 0, unavailable: 0 };
  for await (const globalId of input.globalIds) {
    const node = await input.db.transaction((tx) => scanNode(tx, input, globalId));
    result.scanned += node.scanned; result.missing += node.missing; result.unavailable += node.unavailable;
  }
  return result;
}
