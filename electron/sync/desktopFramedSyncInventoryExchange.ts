import type { FramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventory.js';
import { differingNodeIds, framedSyncInventorySummary } from '../../lib/core/sync/framedSyncInventorySummary.js';
import { decodeFramedSyncInventory, iterateFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryWire.js';
import type { FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';
import type { FramedSyncSessionContext, FramedSyncSessionNoncePort } from '../../lib/core/sync/framedSyncSession.js';

import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { encodeDesktopFramedSyncSession, readDesktopFramedSyncSession } from './desktopFramedSyncSessionWire.js';

type AuthenticatedContext = Omit<FramedSyncSessionContext, 'sessionId'>;

export async function exchangeDesktopFramedSyncInventorySnapshotHttp(args: {
  localInventory: readonly FramedSyncInventoryEntry[];
  context: AuthenticatedContext;
  payloadBudget?: FramedSyncPayloadBudget | undefined;
  endpointUrl: string;
  groupKey: Uint8Array;
  groupSecret: string;
  noncePort: FramedSyncSessionNoncePort;
  detailGlobalIds?: readonly string[];
  pathWithQuery?: string;
  signal?: AbortSignal;
}): Promise<{ local: readonly FramedSyncInventoryEntry[]; remote: readonly FramedSyncInventoryEntry[]; roundId: Uint8Array }> {
  const roundId = crypto.getRandomValues(new Uint8Array(16));
  const local = args.localInventory;
  const messages = iterateFramedSyncInventory({ entries: framedSyncInventorySummary(local), roundId,
    detailGlobalIds: args.detailGlobalIds ?? [], summaryOnly: true });
  const body = await encodeDesktopFramedSyncSession({
    authenticatedContext: args.context,
    groupKey: args.groupKey,
    messages,
    noncePort: args.noncePort,
    payloadBudget: args.payloadBudget
  });
  const response = await postDesktopFramedSync({
    body,
    payloadBudget: args.payloadBudget,
    endpointUrl: args.endpointUrl,
    groupId: args.context.groupId,
    localDeviceId: args.context.initiatorDeviceId,
    localLibraryEpoch: args.context.initiatorLibraryEpoch,
    pathWithQuery: args.pathWithQuery ?? '/companion/framed-sync',
    remoteDeviceId: args.context.responderDeviceId,
    remoteLibraryEpoch: args.context.responderLibraryEpoch,
    ...(args.signal ? { signal: args.signal } : {}),
    secret: args.groupSecret
  });
  const decoded = readDesktopFramedSyncSession({
    authenticatedContext: args.context,
    authorDeviceId: args.context.responderDeviceId,
    frames: response.stream.frames,
    groupKey: args.groupKey,
    preamble: response.stream.preamble
  });
  const remote = await decodeFramedSyncInventory(decoded);
  if (!sameBytes(remote.roundId, roundId)) throw new Error('inventory_round_identity_mismatch');
  if (!args.detailGlobalIds) {
    const detailGlobalIds = differingNodeIds(local, remote.entries);
    if (detailGlobalIds.length) {
      const details = await exchangeDesktopFramedSyncInventorySnapshotHttp({ ...args, localInventory: local, detailGlobalIds });
      const byId = new Map(details.remote.map(entry => [entry.globalId, entry]));
      return { local, remote: remote.entries.map(entry => entry.objectType === 'node' ? byId.get(entry.globalId) ?? entry : entry),
        roundId: details.roundId };
    }
  }
  return { local, remote: remote.entries, roundId };
}


function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => right[index] === byte);
}
