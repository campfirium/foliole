import { randomUUID } from 'node:crypto';

import { beginSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { isDesktopLocalSyncGroupMemberExpired, isDesktopSyncGroupMemberCurrent } from '../database/syncGroupCoverageDesktop.js';

import { loadDesktopSyncGroupPeers, loadDesktopSyncUpstreamPeers } from './desktopSyncGroupTransport.js';

/**
 * After the user confirms, an expired member replaces its library with its upstream's data through the
 * ordinary join overwrite. It stays a member; changes it never synced are not kept.
 */
export function beginDesktopExpiredMemberOverwrite() {
  return runWithDatabaseConnectionOwner(async () => {
    const connection = openDatabaseConnection();
    const db = createBetterSqliteDbPort(connection.sqlite);
    if (await loadSyncGroupLocalAdoption(db)) throw new Error('sync_group_local_adoption_pending');
    // The source must itself be current; the upstream is preferred when it is.
    const current = loadDesktopSyncGroupPeers().filter(peer =>
      isDesktopSyncGroupMemberCurrent(connection.driver, peer.group_id, peer.peer_device_id));
    const [upstream] = loadDesktopSyncUpstreamPeers();
    const peer = current.find(candidate => candidate.peer_device_id === upstream?.peer_device_id) ?? current[0];
    if (!peer) throw new Error('sync_group_current_peer_unavailable');
    if (!isDesktopLocalSyncGroupMemberExpired(connection.driver, peer.group_id)) throw new Error('sync_group_member_not_expired');
    await db.transaction(tx => beginSyncGroupLocalAdoption(tx, { endpointUrl: peer.endpoint_url, groupId: peer.group_id,
      libraryEpoch: `adoption-${randomUUID()}`, providerDeviceId: peer.peer_device_id,
      providerDeviceName: peer.peer_device_name, providerPlatform: peer.peer_platform }));
    return peer;
  });
}
