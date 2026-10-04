import { exchangeSyncIdentityNodeFactPages } from '../../../../../lib/core/sync/syncIdentityFactExchange.js';
import type { SyncIdentityPackPage } from '../../../../../lib/core/sync/syncIdentityPackPage.js';
import { createSyncIdentityStructuralParentReader, readSyncIdentityOriginalSourceHead,
  type SyncIdentitySourceDescriptorReader } from '../../../../../lib/core/sync/syncIdentityStructuralParent.js';
import { fetchDesktopJson } from '../../companionDesktopSyncHttp';

import { readCompanionLocalIdentitySource } from './syncGroupIdentityLocalRead';

export async function exchangeCompanionSyncIdentityFactPages(args: {
  endpointUrl: string;
  snapshotPath: string;
  page: SyncIdentityPackPage;
  transfer: (page: SyncIdentityPackPage) => Promise<{ applied: boolean; factTail?: unknown }>;
}, direction: 'source' | 'receiver') {
  const read: SyncIdentitySourceDescriptorReader = (request) => {
    if (direction === 'receiver') return readCompanionLocalIdentitySource<unknown>(args.snapshotPath,
      'node_facts', { node_id: request.nodeId, section: request.section, after: request.after });
    const query = new URLSearchParams({ source_view_id: args.page.source_view_id,
      node_id: request.nodeId, section: request.section });
    if (request.after !== null) query.set('after', request.after);
    if (args.page.restore_id) query.set('restore_id', args.page.restore_id);
    return fetchDesktopJson<unknown>(args.endpointUrl, `/companion/sync-identity-node-facts?${query}`);
  };
  const head = await readSyncIdentityOriginalSourceHead(read, args.page.objects[0]!.object_id);
  return exchangeSyncIdentityNodeFactPages({ page: args.page,
    digest: head.digest, readParent: createSyncIdentityStructuralParentReader(read, head), transfer: args.transfer });
}
