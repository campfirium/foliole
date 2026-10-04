import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { parseSyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { buildSyncIdentityPackFromDriver } from '../database/syncIdentityPackBuilder.js';

import { assertDesktopIdentityRestoreSource,
  readDesktopIdentityRestoreSetForView } from './companionLanIdentityRestore.js';
import { openCompanionIdentitySession } from './companionLanIdentitySession.js';
import { writeJson, writeWorkgroupFileStream } from './companionLanResponses.js';
import { createWorkgroupResponseStreamCipher } from './workgroupHttpCrypto.js';

export const SYNC_IDENTITY_PACK_PATH = '/companion/sync-identity-pack';

export async function handleCompanionIdentityPackPost(request: http.IncomingMessage,
  response: http.ServerResponse, bodyText: string, peerId: string) {
  let page: ReturnType<typeof parseSyncIdentityPackPage>;
  try { page = parseSyncIdentityPackPage(JSON.parse(bodyText)); }
  catch (error) {
    writeJson(request, response, 400, { error: error instanceof Error ? error.message :
      'sync_identity_pack_request_invalid' }, 'POST, OPTIONS');
    return;
  }
  const group = loadDesktopSyncGroup();
  const url = new URL(request.url ?? '/', 'http://localhost');
  const restoreId = url.searchParams.get('restore_id') ?? undefined;
  if (page.restore_id !== restoreId || restoreId && url.searchParams.size !== 1) {
    writeJson(request, response, 400, { error: 'sync_identity_restore_page_mismatch' }, 'POST, OPTIONS');
    return;
  }
  if (!group || group.group_id !== page.group_id ||
      group.local_device_identity_key !== page.source_peer_id || page.target_peer_id !== peerId) {
    writeJson(request, response, 403, { error: 'sync_identity_pack_peer_mismatch' }, 'POST, OPTIONS');
    return;
  }
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-identity-pack-'));
  const outputPath = path.join(tempRoot, `${randomUUID()}.syncpack`);
  try {
    if (restoreId) assertDesktopIdentityRestoreSource({ groupId: page.group_id,
      localDeviceId: page.source_peer_id, restoreId });
    const view = openCompanionIdentitySession(page.group_id, peerId, page.source_view_id, restoreId);
    try {
      if (restoreId && page.restore_set_id !== (await readDesktopIdentityRestoreSetForView({
        groupId: page.group_id, localDeviceId: page.source_peer_id,
        peerId, restoreId, view })).set_id) {
        throw new Error('sync_identity_restore_set_mismatch');
      }
      await buildSyncIdentityPackFromDriver({ page, outputPath }, view.driver);
    }
    finally { view.close(); }
    const cipher = createWorkgroupResponseStreamCipher(request, 'application/zip');
    await writeWorkgroupFileStream(request, response, 200,
      { filePath: outputPath, mimeType: 'application/zip' }, cipher);
  } catch (error) {
    if (response.headersSent) throw error;
    const message = error instanceof Error ? error.message : 'sync_identity_pack_build_failed';
    if (!['sync_identity_source_view_unavailable', 'sync_identity_pack_source_changed',
      'sync_identity_pack_state_mismatch', 'sync_identity_pack_page_over_budget',
      'sync_identity_restore_source_mismatch', 'sync_identity_restore_set_mismatch',
      'sync_identity_source_view_changed'].includes(message)) {
      throw error;
    }
    const status = 409;
    writeJson(request, response, status, { error: message }, 'POST, OPTIONS');
  } finally { await fs.rm(tempRoot, { recursive: true, force: true }); }
}
