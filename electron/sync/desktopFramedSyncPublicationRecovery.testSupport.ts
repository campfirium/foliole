import { z } from 'zod';

import type { DesktopFramedSyncFixtureProcess,
  DesktopFramedSyncFixtureSnapshot } from './desktopFramedSyncTwoProcess.testSupport.js';

const bytes = z.instanceof(Uint8Array);
const entries = z.array(z.object({
  frontierFactIds: z.array(z.string()), globalId: z.string(), objectType: z.string(),
  requiredRelationIds: z.array(z.string()), resourceHashes: z.array(bytes),
  reviewFactIds: z.array(z.string()), sharedStateHash: bytes,
  stateFactIds: z.array(z.string()).default([]), versionStates: z.array(z.string()).optional(),
  currentVersionId: z.string().optional(), unready: z.boolean().optional()
}));

export async function readFixtureInventory(process: DesktopFramedSyncFixtureProcess) {
  return entries.parse(await process.invoke('round', { input: { kind: 'read_inventory' } }));
}

export function reconnectFixturePeer(process: DesktopFramedSyncFixtureProcess,
  peer: DesktopFramedSyncFixtureSnapshot) {
  return process.invoke('round', { input: { kind: peer.deviceId.startsWith('[') ? 'request_reconcile' : 'reconcile',
    peer: { deviceId: peer.deviceId, libraryEpoch: `${peer.deviceId}-epoch` }, peerOrigin: peer.origin
  } });
}
