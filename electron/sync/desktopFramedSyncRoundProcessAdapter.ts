import { z } from 'zod';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { readFramedSyncInventory, readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';

import { runDesktopSyncCoordinator } from './desktopSyncCoordinator.js';
import { saveDesktopSyncGroupRoute } from './desktopSyncGroupRoutes.js';
import { continueDesktopSyncGroupSync } from './desktopSyncGroupTransport.js';

const identity = z.object({ deviceId: z.string().min(1), libraryEpoch: z.string().min(1) });
const command = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('remember_peer'), peer: identity, peerOrigin: z.string().url() }),
  z.object({ kind: z.literal('request_reconcile'), peer: identity, peerOrigin: z.string().url() }),
  z.object({ kind: z.literal('trigger_peer_sync'), peer: identity, peerOrigin: z.string().url() }),
  z.object({ kind: z.literal('trigger_sync') }),
  z.object({ kind: z.literal('read_inventory') }),
  z.object({ globalId: z.string().min(1), kind: z.literal('read_entry'), objectType: z.string().min(1) })
]);

type AdapterInput = Readonly<{ db: DbPort; groupId: string; local: z.infer<typeof identity> }>;

export function createDesktopFramedSyncRoundProcessAdapter(input: AdapterInput) {
  return async (value: unknown): Promise<unknown> => {
    const request = command.parse(value);
    if (request.kind === 'trigger_sync') return runDesktopSyncCoordinator('manual');
    if (request.kind === 'read_inventory') return readFramedSyncInventory(input.db);
    if (request.kind === 'read_entry') return readFramedSyncInventoryEntry(input.db, request);
    const peer = { endpoint_url: request.peerOrigin, group_id: input.groupId,
      local_device_id: input.local.deviceId, peer_device_id: request.peer.deviceId,
      peer_device_name: request.peer.deviceId, peer_platform: 'desktop' };
    if (request.kind === 'trigger_peer_sync') return runDesktopSyncCoordinator('automatic', peer);
    return request.kind === 'remember_peer' ? saveDesktopSyncGroupRoute(peer) : continueDesktopSyncGroupSync(peer);
  };
}
