import { recordFramedSyncResourceAvailability } from '../database/framedSyncResourceAvailability.js';

import { loadNodeOwnedArticleResourceNeeds } from './nodeOwnedArticleResourceNeeds.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';

/** Current references and actual files are authoritative; availability is only a rebuildable index. */
export async function readRequestSyncAttachmentNeeds(host: Pick<RequestSyncDatabaseHost, 'readSnapshot' | 'write'>,
  isPresent: (storageKey: string) => Promise<boolean>) {
  const resources = await host.readSnapshot(async db => {
    const nodes = await db.query<{ id: string }>('SELECT id FROM nodes WHERE deleted_at IS NULL');
    const result = await loadNodeOwnedArticleResourceNeeds(db, nodes.map(node => node.id));
    if (result.unreadableArticleIds.length) throw new Error('attachment_current_body_unavailable');
    return result.needs;
  });
  const missing: string[] = [];
  const present: string[] = [];
  for (const resource of resources) {
    if (await isPresent(resource.storageKey)) present.push(resource.contentHash);
    else missing.push(resource.storageKey);
  }
  await host.write(async db => {
    await recordFramedSyncResourceAvailability(db, present, true);
    await recordFramedSyncResourceAvailability(db, missing.map(key => key.slice(0, 64)), false);
  });
  return missing;
}
