import { parseSyncIdentityPackContainerManifest } from '../../../../../../lib/core/sync/syncIdentityPackManifest.js';
import { parseSyncIdentityPackPage, type SyncIdentityPackPage } from '../../../../../../lib/core/sync/syncIdentityPackPage.js';
import { deleteCompanionDownloadedSyncPack,
  downloadCompanionDesktopSyncIdentityPack } from '../../../companionSyncPackTransfer';
import { prepareNativeCompanionWorkgroupRequest } from '../../network/signedRequest';

import { applyCompanionSyncIdentityPackPath } from './companionSyncIdentityPackApply';

export async function downloadAndApplyCompanionSyncIdentityPage(args: {
  endpointUrl: string;
  hostName: string;
  page: SyncIdentityPackPage;
  sourceHostName?: string;
}) {
  const downloaded = await downloadCompanionSyncIdentityPage(args);
  try {
    return await applyCompanionSyncIdentityPackPath({
      expectedPageId: downloaded.page.page_id, hostName: args.hostName,
      manifest: downloaded.containerManifest, packPath: downloaded.packPath,
      ...(args.sourceHostName ? { sourceHostName: args.sourceHostName } : {}),
      sourcePeerId: downloaded.page.source_peer_id,
      targetPeerId: downloaded.page.target_peer_id
    });
  } finally { await downloaded.cleanup(); }
}

/** Retain an authenticated page for a full restore before any live apply. */
export async function downloadCompanionSyncIdentityPage(args: {
  endpointUrl: string;
  page: SyncIdentityPackPage;
}) {
  const page = parseSyncIdentityPackPage(args.page);
  const pathWithQuery = '/companion/sync-identity-pack' +
    (page.restore_id ? '?' + new URLSearchParams({ restore_id: page.restore_id }) : '');
  const url = new URL(pathWithQuery, args.endpointUrl).toString();
  const signed = await prepareNativeCompanionWorkgroupRequest({
    bodyText: JSON.stringify(page), endpointUrl: args.endpointUrl,
    method: 'POST', pathWithQuery
  });
  const pack = await downloadCompanionDesktopSyncIdentityPack({
    body: signed.body, expectedPeerId: page.target_peer_id,
    expectedSourcePeerId: page.source_peer_id, headers: signed.headers, url
  });
  try {
    const manifest = parseSyncIdentityPackContainerManifest(pack.manifest, {
      sourcePeerId: page.source_peer_id, targetPeerId: page.target_peer_id
    });
    if (manifest.identity_page.page_id !== page.page_id ||
        manifest.identity_page.restore_id !== page.restore_id ||
        manifest.identity_page.restore_set_id !== page.restore_set_id) {
      throw new Error('sync_identity_pack_page_changed');
    }
    return { page, manifest, containerManifest: pack.manifest, packPath: pack.packPath,
      cleanup: () => deleteCompanionDownloadedSyncPack(pack.packPath) };
  } catch (error) {
    await deleteCompanionDownloadedSyncPack(pack.packPath);
    throw error;
  }
}
