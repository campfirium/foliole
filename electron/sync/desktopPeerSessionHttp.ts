import { SYNC_SESSION_PATH, type SyncSessionRequest } from '../../lib/platform/syncSessionContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { createDesktopSyncGroupSignedHeaders, readDesktopWorkgroupResponse } from './desktopSyncGroupHttp.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { localDesktopSyncTier } from './desktopSyncUpstream.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

/** Same session endpoint phones use; desktops sign it with the workgroup key like other peer requests. */
export async function requestDesktopPeerSyncSession(peer: DesktopSyncGroupPeer, input: SyncSessionRequest,
  signal?: AbortSignal): Promise<unknown> {
  const tagged = { ...input, tier: localDesktopSyncTier() };
  const pathWithQuery = `${SYNC_SESSION_PATH}?input=${encodeURIComponent(JSON.stringify(tagged))}`;
  const method = input.operation === 'wait' ? 'GET' : 'POST';
  const identity = await runWithDatabaseConnectionOwner(() => {
    const key = loadDesktopWorkgroupKey(peer.group_id);
    if (!key) throw new Error('sync_group_key_missing');
    return { groupId: peer.group_id, localDeviceId: peer.local_device_id, pathWithQuery, secret: key.group_key };
  });
  // The session route authenticates an empty body for every operation; its input travels in the query.
  const response = await fetch(`${peer.endpoint_url}${pathWithQuery}`, {
    method, headers: createDesktopSyncGroupSignedHeaders({ ...identity, method }), ...(signal ? { signal } : {})
  });
  const body = await readDesktopWorkgroupResponse({ contentType: 'application/json; charset=utf-8',
    groupId: peer.group_id, maxEnvelopeBytes: 64 * 1024, method, pathWithQuery, response });
  return JSON.parse(body.toString('utf8'));
}
