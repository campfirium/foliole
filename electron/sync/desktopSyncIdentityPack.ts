import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseSyncIdentityPackPage, type SyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from '../database/syncPackPageBudget.js';

import { createDesktopWorkgroupPost } from './desktopSyncGroupHttp.js';
import { fetchDesktopSyncGroupPackBody } from './desktopSyncGroupPackDownload.js';
import { applyDesktopSyncIdentityArchive } from './desktopSyncIdentityArchiveApply.js';
import { decryptDesktopWorkgroupResponseFile } from './workgroupAeadFileNode.js';
import { isWorkgroupConnectionReset } from './workgroupConnectionReset.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export interface DesktopIdentityPackPeer {
  endpoint_url: string;
  group_id: string;
  local_device_id: string;
  peer_device_id: string;
  peer_device_name?: string;
}

/** Receives one exact identity page; page sequencing is enforced by the apply transaction. */
export async function downloadAndApplyDesktopSyncIdentityPage(args: {
  page: SyncIdentityPackPage;
  peer: DesktopIdentityPackPeer;
}) {
  const page = parseSyncIdentityPackPage(args.page);
  const peer = args.peer;
  if (page.group_id !== peer.group_id || page.source_peer_id !== peer.peer_device_id ||
      page.target_peer_id !== peer.local_device_id) {
    throw new Error('sync_identity_pack_peer_mismatch');
  }
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-identity-receive-'));
  try {
    const archivePath = await downloadDesktopSyncIdentityArchive({
      page, peer, outputRoot: tempRoot
    });
    return await applyDesktopSyncIdentityArchive({
      archivePath, incomingPath: path.join(tempRoot, 'incoming.db'),
      expectedPageId: page.page_id, sourcePeerId: peer.peer_device_id,
      targetPeerId: peer.local_device_id,
      ...(peer.peer_device_name ? { sourceHostName: peer.peer_device_name } : {})
    });
  } finally { await fs.rm(tempRoot, { recursive: true, force: true }); }
}

/** Download an authenticated archive without applying it to the live library. */
export async function downloadDesktopSyncIdentityArchive(args: {
  outputRoot: string;
  page: SyncIdentityPackPage;
  peer: DesktopIdentityPackPeer;
}) {
  const page = parseSyncIdentityPackPage(args.page);
  const peer = args.peer;
  if (page.group_id !== peer.group_id || page.source_peer_id !== peer.peer_device_id ||
      page.target_peer_id !== peer.local_device_id) {
    throw new Error('sync_identity_pack_peer_mismatch');
  }
  const key = await runWithDatabaseConnectionOwner(() => loadDesktopWorkgroupKey(peer.group_id));
  if (!key) throw new Error('sync_group_workgroup_key_missing');
  const pathWithQuery = '/companion/sync-identity-pack' +
    (page.restore_id ? '?' + new URLSearchParams({ restore_id: page.restore_id }) : '');
  let encryptedPath = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const post = await runWithDatabaseConnectionOwner(() => createDesktopWorkgroupPost({
      body: JSON.stringify(page), groupId: peer.group_id,
      localDeviceId: peer.local_device_id, pathWithQuery, secret: key.group_key
    }));
    try {
      encryptedPath = await fetchDesktopSyncGroupPackBody({
        body: post.body, groupId: peer.group_id, headers: post.headers, method: 'POST',
        outputPath: path.join(args.outputRoot, 'encrypted.json'), pathWithQuery,
        url: `${peer.endpoint_url}${pathWithQuery}`
      });
      break;
    } catch (error) {
      if (attempt === 1 || !isWorkgroupConnectionReset(error)) throw error;
    }
  }
  const archivePath = path.join(args.outputRoot, `${page.page_index}.zip`);
  await decryptDesktopWorkgroupResponseFile({
      contentType: 'application/zip', encryptedPath, groupId: peer.group_id,
      maxPlaintextBytes: DEFAULT_SYNC_PACK_PAGE_BUDGET.transferBytes,
      method: 'POST', outputPath: archivePath, pathWithQuery
  });
  return archivePath;
}
