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

import {
  prepareDesktopFramedSyncPublishedTransfer,
  sendDesktopFramedSyncPublishedTransfer
} from './desktopFramedSyncProcessOutbound.js';
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

type EndpointState = EndpointInput & Readonly<{
  attempts: Map<string, Parameters<typeof sendDesktopFramedSyncPublishedTransfer>[0]['attempt']>;
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

async function selectOutbound(input: EndpointState, difference: FramedSyncInventoryDifference):
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
  const attempt = await prepareDesktopFramedSyncPublishedTransfer({
    db: input.db,
    groupSecret: input.groupSecret,
    publication: result.publication,
    staging: input.staging
  });
  input.attempts.set(hex(result.publication.transferId), attempt);
  return { kind: 'published', publication: result.publication };
}

async function sendPublishedTransfer(input: EndpointState, args: Readonly<{
  publication: Parameters<FramedSyncStagingPort['publishOutbound']>[0];
}>) {
  const attempt = input.attempts.get(hex(args.publication.transferId));
  if (!attempt) throw new Error('framed_sync_round_attempt_missing');
  await sendDesktopFramedSyncPublishedTransfer({
    attempt,
    groupSecret: input.groupSecret,
    peerOrigin: input.peerOrigin,
    publication: args.publication,
    staging: input.staging
  });
  const receipt = await input.staging.loadReceipt(args.publication.transferId);
  return receipt ? 'committed' as const : 'pending' as const;
}

export function createDesktopFramedSyncRoundEndpoint(
  input: EndpointInput
): FramedSyncRoundEndpoint {
  const attempts: EndpointState['attempts'] = new Map();
  const state = { ...input, attempts };
  return {
    deviceId: input.local.deviceId,
    libraryEpoch: input.local.libraryEpoch,
    readInventory: () => readDesktopFramedSyncRoundInventory(input.db),
    readInventoryEntry: (key) => readDesktopFramedSyncRoundInventoryEntry(input.db, key),
    selectOutbound: (difference) => selectOutbound(state, difference),
    sendPublishedTransfer: ({ publication }) => sendPublishedTransfer(state, { publication }),
    staging: input.staging
  };
}
