import os from 'node:os';

import Database from 'better-sqlite3';

import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { applyDesktopSyncIdentityRestore } from './desktopSyncIdentityRestoreApply.js';
import { probeDesktopSyncIdentityRestoreSet } from './desktopSyncIdentityRestoreProbe.js';
import { stageDesktopSyncIdentityRestore } from './desktopSyncIdentityRestoreStage.js';
import { preserveDesktopIdentityRestore } from './preserveDesktopGroupRestore.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';
import { notifyWorkspaceSyncApplied } from './workspaceSyncAppliedEvents.js';

function notifyRestoredObjects(candidatePath: string, removedNodeIds: readonly string[]) {
  const database = new Database(candidatePath, { readonly: true, fileMustExist: true });
  try {
    let afterType = '';
    let afterId = '';
    let removed = [...removedNodeIds];
    for (;;) {
      const rows = database.prepare(`SELECT object_type, object_id FROM candidates
        WHERE object_type > ? OR (object_type = ? AND object_id > ?)
        ORDER BY object_type, object_id LIMIT 128`).all(
        afterType, afterType, afterId) as Array<{ object_type: string; object_id: string }>;
      if (!rows.length) break;
      const nodes = rows.filter((row) => row.object_type === 'node').map((row) => row.object_id);
      notifyWorkspaceSyncApplied({ appliedNodeIds: [...nodes, ...removed],
        appliedObjectIds: rows.filter((row) => row.object_type !== 'node')
          .map((row) => `${row.object_type}:${row.object_id}`),
        appliedReviewOpIds: [] });
      removed = [];
      afterType = rows.at(-1)!.object_type;
      afterId = rows.at(-1)!.object_id;
    }
    if (removed.length) notifyWorkspaceSyncApplied({ appliedNodeIds: removed,
      appliedObjectIds: [], appliedReviewOpIds: [] });
  } finally { database.close(); }
}

/** Restore from a frozen authenticated set before resuming normal peer rounds. */
export async function runDesktopSyncIdentityRestoreRound(peer: DesktopSyncGroupPeer,
  restoreId: string) {
  const secret = await runWithDatabaseConnectionOwner(() => {
    const key = loadDesktopWorkgroupKey(peer.group_id);
    if (!key) throw new Error('sync_group_workgroup_key_missing');
    return key.group_key;
  });
  const probe = await probeDesktopSyncIdentityRestoreSet({
    endpointUrl: peer.endpoint_url, groupId: peer.group_id,
    localDeviceId: peer.local_device_id, peerDeviceId: peer.peer_device_id,
    outputRoot: os.tmpdir(), restoreId, secret
  });
  try {
    const staged = await stageDesktopSyncIdentityRestore({ peer, probe });
    try {
      await runWithDatabaseConnectionOwner(() =>
        preserveDesktopIdentityRestore(peer.group_id, restoreId));
      const result = await applyDesktopSyncIdentityRestore({ peer, staged });
      if (result.applied) {
        await runWithDatabaseConnectionOwner(() => initializeWorkspaceSearchSidecar(
          openDatabaseConnection(), { requireCurrentSource: true }));
        notifyRestoredObjects(probe.candidatePath, result.removedNodeIds);
      }
      return result;
    } finally { await staged.cleanup(); }
  } finally { await probe.cleanup(); }
}
