import { recordFramedSyncResourceAvailability } from '../database/framedSyncResourceAvailability.js';

import { loadNodeOwnedArticleResourceNeeds } from './nodeOwnedArticleResourceNeeds.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';

export const ATTACHMENT_STAT_BATCH_COUNT = 64;
export const ATTACHMENT_STAT_BATCH_BYTES = 16 * 1024;

export function* attachmentStatBatches(keys: readonly string[]) {
  let batch: string[] = [];
  let bytes = 0;
  for (const key of keys) {
    const size = new TextEncoder().encode(key).length;
    if (size > ATTACHMENT_STAT_BATCH_BYTES) throw new Error('attachment_stat_key_too_large');
    if (batch.length && (batch.length === ATTACHMENT_STAT_BATCH_COUNT || bytes + size > ATTACHMENT_STAT_BATCH_BYTES)) {
      yield batch;
      batch = [];
      bytes = 0;
    }
    batch.push(key);
    bytes += size;
  }
  if (batch.length) yield batch;
}

/** Current references and actual files are authoritative; availability is only a rebuildable index. */
export async function readRequestSyncAttachmentNeeds(host: Pick<RequestSyncDatabaseHost, 'readSnapshot' | 'write'>,
  inspect: (storageKeys: string[]) => Promise<boolean[]>) {
  const missing = new Set<string>();
  const seen = new Set<string>();
  let after: string | null = null;
  while (true) {
    const page = await readPage(host, after);
    for (const keys of attachmentStatBatches(page.keys.filter(key => !seen.has(key)))) {
      const presence = await inspect(keys);
      if (presence.length !== keys.length || presence.some(value => typeof value !== 'boolean')) {
        throw new Error('attachment_stat_response_invalid');
      }
      await host.write(db => db.transaction(async tx => {
        await recordFramedSyncResourceAvailability(tx, keys.filter((_, i) => presence[i]).map(key => key.slice(0, 64)), true);
        await recordFramedSyncResourceAvailability(tx, keys.filter((_, i) => !presence[i]).map(key => key.slice(0, 64)), false);
      }));
      keys.forEach((key, i) => { seen.add(key); if (!presence[i]) missing.add(key); });
    }
    if (page.last === null) break;
    after = page.last;
  }
  return [...missing];
}

async function readPage(host: Pick<RequestSyncDatabaseHost, 'readSnapshot'>, after: string | null) {
  return host.readSnapshot(async db => {
    const nodes = await db.query<{ id: string }>(`SELECT id FROM nodes WHERE deleted_at IS NULL
      ${after === null ? '' : 'AND id > ?'} ORDER BY id LIMIT 128`, after === null ? [] : [after]);
    const result = await loadNodeOwnedArticleResourceNeeds(db, nodes.map(node => node.id));
    if (result.unreadableArticleIds.length) throw new Error('attachment_current_body_unavailable');
    return { keys: result.needs.map(need => need.storageKey), last: nodes.length === 128 ? nodes.at(-1)!.id : null };
  });
}
