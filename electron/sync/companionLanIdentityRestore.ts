import type http from 'node:http';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { verifySyncIdentityFactProof } from '../../lib/core/sync/syncIdentityFactProofSeal.js';
import { readReadySyncIdentityInventory } from '../../lib/core/sync/syncIdentityGlobalRead.js';
import { readSyncIdentityNodeFactDataRoot } from '../../lib/core/sync/syncIdentityNodeFactIndex.js';
import { buildSyncIdentityRestoreSet } from '../../lib/core/sync/syncIdentityRestoreSet.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadDesktopSyncGroupRestoreState } from '../database/syncGroupRestoreState.js';

import { createCompanionIdentitySession } from './companionLanIdentitySession.js';
import { writeJson } from './companionLanResponses.js';

export const SYNC_IDENTITY_RESTORE_SET_PATH = '/companion/sync-identity-restore-set';

export function assertDesktopIdentityRestoreSource(args: {
  groupId: string; localDeviceId: string; restoreId: string;
}) {
  if (!args.restoreId || args.restoreId.length > 256 ||
      args.restoreId.trim() !== args.restoreId) {
    throw new Error('sync_identity_restore_id_invalid');
  }
  const state = loadDesktopSyncGroupRestoreState(openDatabaseConnection().driver, args.groupId);
  if (!state?.applied || state.event.restore_id !== args.restoreId ||
      state.event.source_device_identity_key !== args.localDeviceId) {
    throw new Error('sync_identity_restore_source_mismatch');
  }
}

export async function serveDesktopIdentityRestoreSet(args: {
  groupId: string; localDeviceId: string; peerId: string;
  request: http.IncomingMessage; response: http.ServerResponse; restoreId: string;
}) {
  assertDesktopIdentityRestoreSource(args);
  const view = await createCompanionIdentitySession(args.groupId, args.peerId, args.restoreId);
  try {
    const set = await readDesktopIdentityRestoreSetForView({ ...args, view });
    writeJson(args.request, args.response, 200, set, 'GET, OPTIONS');
  } finally { view.close(); }
}

export async function readDesktopIdentityRestoreSetForView(args: {
  groupId: string; localDeviceId: string; peerId: string; restoreId: string;
  view: { port: DbPort; sourceEpoch: string; sourceViewId: string };
}) {
  return buildSyncIdentityRestoreSet({ restore_id: args.restoreId,
    group_id: args.groupId, source_peer_id: args.localDeviceId,
    target_peer_id: args.peerId, source_view_id: args.view.sourceViewId,
    source_epoch: args.view.sourceEpoch,
    fact_proof_root: await verifySyncIdentityFactProof(args.view.port),
    fact_data_root: await readSyncIdentityNodeFactDataRoot(args.view.port),
    inventory: await readReadySyncIdentityInventory(args.view.port) });
}
