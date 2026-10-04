import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { syncIdentityFactTailSchema } from '../../lib/core/sync/syncIdentityFactTransfer.js';
import { parseSyncIdentityPackPage, type SyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { buildSyncIdentityPackFromDriver } from '../database/syncIdentityPackBuilder.js';
import { openSyncIdentitySourceView } from '../database/syncIdentitySourceView.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from '../database/syncPackPageBudget.js';

import { postDesktopWorkgroupJson } from './desktopSyncGroupHttp.js';
import type { DesktopIdentityPackPeer } from './desktopSyncIdentityPack.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export async function uploadDesktopSyncIdentityPage(args: {
  localViewPath: string;
  page: SyncIdentityPackPage;
  peer: DesktopIdentityPackPeer;
}) {
  const page = parseSyncIdentityPackPage(args.page);
  const peer = args.peer;
  if (page.group_id !== peer.group_id || page.source_peer_id !== peer.local_device_id ||
      page.target_peer_id !== peer.peer_device_id) {
    throw new Error('sync_identity_pack_peer_mismatch');
  }
  const key = await runWithDatabaseConnectionOwner(() => loadDesktopWorkgroupKey(peer.group_id));
  if (!key) throw new Error('sync_group_workgroup_key_missing');
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-identity-upload-'));
  try {
    const archivePath = path.join(tempRoot, 'outgoing.zip');
    const view = openSyncIdentitySourceView(args.localViewPath, page.source_view_id);
    try { await buildSyncIdentityPackFromDriver({ page, outputPath: archivePath }, view.driver); }
    finally { view.close(); }
    const archive = await fs.readFile(archivePath);
    if (archive.length > DEFAULT_SYNC_PACK_PAGE_BUDGET.transferBytes) {
      throw new Error('sync_identity_pack_page_over_budget');
    }
    const result = await postDesktopWorkgroupJson({
      body: JSON.stringify({ archive_base64url: archive.toString('base64url') }),
      endpointUrl: peer.endpoint_url, groupId: peer.group_id,
      localDeviceId: peer.local_device_id,
      pathWithQuery: '/companion/sync-identity-push', secret: key.group_key
    });
    if (result.pageId !== page.page_id || typeof result.applied !== 'boolean') {
      throw new Error('sync_identity_push_receipt_invalid');
    }
    return { applied: result.applied, pageId: page.page_id,
      ...(result.factTail === undefined ? {} : { factTail: syncIdentityFactTailSchema.parse(result.factTail) }) };
  } finally { await fs.rm(tempRoot, { recursive: true, force: true }); }
}
