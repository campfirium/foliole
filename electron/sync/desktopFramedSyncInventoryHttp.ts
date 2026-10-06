import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  decodeFramedSyncDifferenceRequest,
  projectFramedSyncDifferenceRequest,
  resolveFramedSyncDifferenceRequest
} from '../../lib/core/sync/framedSyncDifferenceRequest.js';
import type { FramedSyncInventoryDifference } from '../../lib/core/sync/framedSyncInventory.js';
import {
  decodeFramedSyncInventory,
  encodeFramedSyncInventory
} from '../../lib/core/sync/framedSyncInventoryWire.js';
import type {
  FramedSyncSessionContext,
  FramedSyncSessionNoncePort
} from '../../lib/core/sync/framedSyncSession.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { publishDesktopFramedSyncNodeOutbound } from '../database/desktopFramedSyncOutboundSelection.js';

import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { resumeDesktopFramedSyncPendingPublications } from './desktopFramedSyncPendingPublications.js';
import { loadDesktopFramedSyncPreparedTransferBody } from './desktopFramedSyncPreparedTransferBody.js';
import { prepareDesktopFramedSyncPublishedTransfer } from './desktopFramedSyncProcessOutbound.js';
import {
  readDesktopFramedSyncRoundInventory,
  readDesktopFramedSyncRoundInventoryEntry
} from './desktopFramedSyncRoundInventory.js';
import {
  decodeDesktopFramedSyncSession,
  encodeDesktopFramedSyncSession
} from './desktopFramedSyncSessionWire.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';
import { loadDesktopSyncGroupRoutes } from './desktopSyncGroupRoutes.js';

type AuthenticatedContext = Omit<FramedSyncSessionContext, 'sessionId'>;

export async function respondDesktopFramedSyncInventory(args: {
  context: AuthenticatedContext;
  db: DbPort;
  groupKey: Uint8Array;
  groupSecret: string;
  noncePort: FramedSyncSessionNoncePort;
  staging: FramedSyncStagingPort;
  stream: FramedSyncStreamBody<FramedSyncWireFrame>;
}) {
  const request = await decodeDesktopFramedSyncSession({
    authenticatedContext: args.context,
    authorDeviceId: args.context.initiatorDeviceId,
    frames: args.stream.frames,
    groupKey: args.groupKey,
    preamble: args.stream.preamble
  });
  if (request[0]?.payloadCase === 'difference_request') {
    return respondDesktopFramedSyncDifferenceRequest({ ...args, request });
  }
  const { roundId } = await decodeFramedSyncInventory(request);
  const route = loadDesktopSyncGroupRoutes(args.context.groupId).find((peer) =>
    peer.peer_device_id === args.context.initiatorDeviceId);
  if (route) await resumeDesktopFramedSyncPendingPublications({
    db: args.db, groupId: args.context.groupId, groupSecret: args.groupSecret,
    local: { deviceId: args.context.responderDeviceId, libraryEpoch: args.context.responderLibraryEpoch },
    peer: { deviceId: args.context.initiatorDeviceId, libraryEpoch: args.context.initiatorLibraryEpoch },
    peerOrigin: route.endpoint_url, staging: args.staging
  });
  const entries = await readDesktopFramedSyncRoundInventory(args.db);
  const messages = await encodeFramedSyncInventory({ entries, roundId });
  return encodeDesktopFramedSyncSession({
    authenticatedContext: args.context,
    groupKey: args.groupKey,
    messages,
    noncePort: args.noncePort
  });
}

async function respondDesktopFramedSyncDifferenceRequest(args: Parameters<
  typeof respondDesktopFramedSyncInventory
>[0] & { request: Awaited<ReturnType<typeof decodeDesktopFramedSyncSession>> }) {
  if (args.request.length !== 1) throw new Error('framed_sync_difference_request_count_invalid');
  const request = decodeFramedSyncDifferenceRequest(args.request[0]!);
  const first = request.facts[0];
  if (!first) throw new Error('framed_sync_difference_request_fact_required');
  const current = await readDesktopFramedSyncRoundInventoryEntry(args.db, first);
  if (!current) throw new Error('framed_sync_difference_request_source_missing');
  const difference = resolveFramedSyncDifferenceRequest(current, request);
  const selection = await publishDesktopFramedSyncNodeOutbound({
    context: {
      groupId: args.context.groupId,
      protocolVersion: args.context.protocolVersion,
      receiverDeviceId: args.context.initiatorDeviceId,
      receiverLibraryEpoch: args.context.initiatorLibraryEpoch,
      senderDeviceId: args.context.responderDeviceId,
      senderLibraryEpoch: args.context.responderLibraryEpoch
    },
    difference,
    port: args.db,
    readCurrentInventoryEntry: readDesktopFramedSyncRoundInventoryEntry
  });
  if (selection.kind === 'deferred') throw new Error('framed_sync_source_changed');
  const attempt = await prepareDesktopFramedSyncPublishedTransfer({
    db: args.db,
    groupSecret: args.groupSecret,
    publication: selection.publication,
    staging: args.staging
  });
  return loadDesktopFramedSyncPreparedTransferBody({
    attempt, publication: selection.publication, staging: args.staging
  });
}

export async function exchangeDesktopFramedSyncInventoryHttp(args: {
  context: AuthenticatedContext;
  db: DbPort;
  endpointUrl: string;
  groupKey: Uint8Array;
  groupSecret: string;
  noncePort: FramedSyncSessionNoncePort;
}) {
  const roundId = crypto.getRandomValues(new Uint8Array(16));
  const local = await readDesktopFramedSyncRoundInventory(args.db);
  const messages = await encodeFramedSyncInventory({ entries: local, roundId });
  const body = await encodeDesktopFramedSyncSession({
    authenticatedContext: args.context,
    groupKey: args.groupKey,
    messages,
    noncePort: args.noncePort
  });
  const response = await postDesktopFramedSync({
    body,
    endpointUrl: args.endpointUrl,
    groupId: args.context.groupId,
    localDeviceId: args.context.initiatorDeviceId,
    localLibraryEpoch: args.context.initiatorLibraryEpoch,
    pathWithQuery: '/companion/framed-sync',
    remoteDeviceId: args.context.responderDeviceId,
    remoteLibraryEpoch: args.context.responderLibraryEpoch,
    secret: args.groupSecret
  });
  const decoded = await decodeDesktopFramedSyncSession({
    authenticatedContext: args.context,
    authorDeviceId: args.context.responderDeviceId,
    frames: response.stream.frames,
    groupKey: args.groupKey,
    preamble: response.stream.preamble
  });
  const remote = await decodeFramedSyncInventory(decoded);
  if (!sameBytes(remote.roundId, roundId)) throw new Error('inventory_round_identity_mismatch');
  return { local, remote: remote.entries, roundId };
}

export async function requestDesktopFramedSyncDifferenceHttp(args: {
  context: AuthenticatedContext;
  difference: FramedSyncInventoryDifference;
  endpointUrl: string;
  groupKey: Uint8Array;
  groupSecret: string;
  noncePort: FramedSyncSessionNoncePort;
  roundId: Uint8Array;
}) {
  const projected = projectFramedSyncDifferenceRequest({
    difference: args.difference, roundId: args.roundId
  });
  const body = await encodeDesktopFramedSyncSession({
    authenticatedContext: args.context,
    groupKey: args.groupKey,
    messages: [{ payload: projected.payload, payloadCase: 'difference_request' }],
    noncePort: args.noncePort
  });
  return (await postDesktopFramedSync({
    body,
    endpointUrl: args.endpointUrl,
    groupId: args.context.groupId,
    localDeviceId: args.context.initiatorDeviceId,
    localLibraryEpoch: args.context.initiatorLibraryEpoch,
    pathWithQuery: '/companion/framed-sync',
    remoteDeviceId: args.context.responderDeviceId,
    remoteLibraryEpoch: args.context.responderLibraryEpoch,
    secret: args.groupSecret
  })).stream;
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => right[index] === byte);
}
