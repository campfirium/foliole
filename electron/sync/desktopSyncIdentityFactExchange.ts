import { exchangeSyncIdentityNodeFactPages } from '../../lib/core/sync/syncIdentityFactExchange.js';
import { readSyncIdentityNodeFactDescriptorPage } from '../../lib/core/sync/syncIdentityNodeFactPage.js';
import type { SyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';
import { createSyncIdentityStructuralParentReader, readSyncIdentityOriginalSourceHead,
  type SyncIdentitySourceDescriptorReader } from '../../lib/core/sync/syncIdentityStructuralParent.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { openSyncIdentitySourceView } from '../database/syncIdentitySourceView.js';

import { fetchDesktopWorkgroupJson } from './desktopSyncGroupHttp.js';
import { downloadAndApplyDesktopSyncIdentityPage, type DesktopIdentityPackPeer } from './desktopSyncIdentityPack.js';
import { uploadDesktopSyncIdentityPage } from './desktopSyncIdentityPush.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export async function exchangeDesktopSyncIdentityFactPages(args: {
  page: SyncIdentityPackPage;
  peer: DesktopIdentityPackPeer;
  localViewPath?: string;
  transfer?: (page: SyncIdentityPackPage) => Promise<{ applied: boolean; factTail?: unknown }>;
}, direction: 'source' | 'receiver') {
  const read = await createDescriptorReader(args, direction);
  const head = await readSyncIdentityOriginalSourceHead(read, args.page.objects[0]!.object_id);
  return exchangeSyncIdentityNodeFactPages({ page: args.page, digest: head.digest,
    readParent: createSyncIdentityStructuralParentReader(read, head),
    transfer: args.transfer ?? ((page) => direction === 'source'
      ? downloadAndApplyDesktopSyncIdentityPage({ peer: args.peer, page })
      : uploadDesktopSyncIdentityPage({ peer: args.peer, page, localViewPath: args.localViewPath! })) });
}

async function createDescriptorReader(args: {
  page: SyncIdentityPackPage; peer: DesktopIdentityPackPeer; localViewPath?: string;
}, direction: 'source' | 'receiver'): Promise<SyncIdentitySourceDescriptorReader> {
  if (direction === 'receiver') {
    if (!args.localViewPath) throw new Error('sync_identity_local_view_missing');
    const localViewPath = args.localViewPath;
    return async (request) => {
      const view = openSyncIdentitySourceView(localViewPath, args.page.source_view_id);
      try { return await readSyncIdentityNodeFactDescriptorPage(view.port, request); }
      finally { view.close(); }
    };
  }
  const key = await runWithDatabaseConnectionOwner(() => loadDesktopWorkgroupKey(args.peer.group_id));
  if (!key) throw new Error('sync_group_workgroup_key_missing');
  return (request) => {
    const query = new URLSearchParams({ source_view_id: args.page.source_view_id,
      node_id: request.nodeId, section: request.section });
    if (request.after !== null) query.set('after', request.after);
    if (args.page.restore_id) query.set('restore_id', args.page.restore_id);
    return fetchDesktopWorkgroupJson<unknown>({
      endpointUrl: args.peer.endpoint_url, groupId: args.peer.group_id,
      localDeviceId: args.peer.local_device_id, secret: key.group_key,
      pathWithQuery: `/companion/sync-identity-node-facts?${query}` });
  };
}
