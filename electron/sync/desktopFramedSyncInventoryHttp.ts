import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  decodeFramedSyncInventory,
  encodeFramedSyncInventory
} from '../../lib/core/sync/framedSyncInventoryWire.js';
import type {
  FramedSyncSessionContext,
  FramedSyncSessionNoncePort
} from '../../lib/core/sync/framedSyncSession.js';

import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { readDesktopFramedSyncRoundInventory } from './desktopFramedSyncRoundInventory.js';
import {
  decodeDesktopFramedSyncSession,
  encodeDesktopFramedSyncSession
} from './desktopFramedSyncSessionWire.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';

type AuthenticatedContext = Omit<FramedSyncSessionContext, 'sessionId'>;

export async function respondDesktopFramedSyncInventory(args: {
  context: AuthenticatedContext;
  db: DbPort;
  groupKey: Uint8Array;
  noncePort: FramedSyncSessionNoncePort;
  stream: FramedSyncStreamBody<FramedSyncWireFrame>;
}) {
  const request = await decodeDesktopFramedSyncSession({
    authenticatedContext: args.context,
    authorDeviceId: args.context.initiatorDeviceId,
    frames: args.stream.frames,
    groupKey: args.groupKey,
    preamble: args.stream.preamble
  });
  const { roundId } = await decodeFramedSyncInventory(request);
  const entries = await readDesktopFramedSyncRoundInventory(args.db);
  const messages = await encodeFramedSyncInventory({ entries, roundId });
  return encodeDesktopFramedSyncSession({
    authenticatedContext: args.context,
    groupKey: args.groupKey,
    messages,
    noncePort: args.noncePort
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

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => right[index] === byte);
}
