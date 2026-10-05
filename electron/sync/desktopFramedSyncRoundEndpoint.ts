import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext
} from '../../lib/core/sync/framedSyncContract.js';
import type {
  FramedSyncInventoryDifference
} from '../../lib/core/sync/framedSyncInventory.js';
import type {
  FramedSyncRoundEndpoint,
  FramedSyncRoundSelection
} from '../../lib/core/sync/framedSyncInventoryRoundCoordinator.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { publishDesktopFramedSyncNodeOutbound } from '../database/desktopFramedSyncOutboundSelection.js';

import { synchronizeDesktopFramedSync } from './desktopFramedSyncProcessOutbound.js';
import {
  readDesktopFramedSyncRoundInventory,
  readDesktopFramedSyncRoundInventoryEntry
} from './desktopFramedSyncRoundInventory.js';

export type DesktopFramedSyncRoundIdentity = Readonly<{
  deviceId: string;
  libraryEpoch: string;
}>;

type EndpointInput = Readonly<{
  db: DbPort;
  groupId: string;
  groupSecret: string;
  local: DesktopFramedSyncRoundIdentity;
  peer: DesktopFramedSyncRoundIdentity;
  peerOrigin: string;
  staging: FramedSyncStagingPort;
}>;

const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');

function transferContext(input: EndpointInput): FramedSyncContext {
  return {
    groupId: input.groupId,
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    receiverDeviceId: input.peer.deviceId,
    receiverLibraryEpoch: input.peer.libraryEpoch,
    senderDeviceId: input.local.deviceId,
    senderLibraryEpoch: input.local.libraryEpoch
  };
}

async function selectOutbound(input: EndpointInput, difference: FramedSyncInventoryDifference):
Promise<FramedSyncRoundSelection> {
  const result = await publishDesktopFramedSyncNodeOutbound({
    context: transferContext(input),
    difference,
    port: input.db,
    readCurrentInventoryEntry: (tx, key) =>
      readDesktopFramedSyncRoundInventoryEntry(tx, key)
  });
  if (result.kind === 'deferred') {
    return { deferredObjects: result.deferredObjects, kind: 'deferred' };
  }
  return { kind: 'published', publication: result.publication };
}

async function sendPublishedTransfer(input: EndpointInput, args: Readonly<{
  difference: FramedSyncInventoryDifference;
  publication: Parameters<FramedSyncStagingPort['publishOutbound']>[0];
}>) {
  const sent = await synchronizeDesktopFramedSync({
    groupId: input.groupId,
    groupSecret: input.groupSecret,
    local: input.local,
    nodeId: args.difference.globalId,
    peerOrigin: input.peerOrigin,
    remote: input.peer,
    staging: input.staging
  });
  if (sent.transferId !== hex(args.publication.transferId)) {
    throw new Error('framed_sync_round_transfer_identity_changed');
  }
  const receipt = await input.staging.loadReceipt(args.publication.transferId);
  return receipt ? 'committed' as const : 'pending' as const;
}

export function createDesktopFramedSyncRoundEndpoint(
  input: EndpointInput
): FramedSyncRoundEndpoint {
  return {
    deviceId: input.local.deviceId,
    libraryEpoch: input.local.libraryEpoch,
    readInventory: () => readDesktopFramedSyncRoundInventory(input.db),
    readInventoryEntry: (key) => readDesktopFramedSyncRoundInventoryEntry(input.db, key),
    selectOutbound: (difference) => selectOutbound(input, difference),
    sendPublishedTransfer: ({ difference, publication }) =>
      sendPublishedTransfer(input, { difference, publication }),
    staging: input.staging
  };
}
