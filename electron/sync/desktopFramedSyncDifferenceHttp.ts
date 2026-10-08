import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_BATCH_LIMITS } from '../../lib/core/sync/framedSyncBatchLimits.js';
import { FRAMED_SYNC_LIMITS } from '../../lib/core/sync/framedSyncContract.js';
import { projectFramedSyncDifferenceRequest } from '../../lib/core/sync/framedSyncDifferenceRequest.js';
import type { FramedSyncInventoryDifference } from '../../lib/core/sync/framedSyncInventory.js';
import { startFramedSyncResourceDemandRequest } from '../../lib/core/sync/framedSyncResourceDemands.js';
import { projectFramedSyncResourceRequest, readFramedSyncRequestedResources,
  type FramedSyncRequestedResource } from '../../lib/core/sync/framedSyncResourceRequest.js';
import type { FramedSyncSessionContext, FramedSyncSessionNoncePort } from '../../lib/core/sync/framedSyncSession.js';
import { readFramedSyncPayloadBudget } from '../database/framedSyncPayloadBudgetOwner.js';

import { postDesktopFramedSync, postDesktopFramedSyncBytes } from './desktopFramedSyncHttp.js';
import { encodeDesktopFramedSyncSession } from './desktopFramedSyncSessionWire.js';
import { readFramedSyncStreamSequence } from './desktopFramedSyncStreamSequence.js';

type AuthenticatedContext = Omit<FramedSyncSessionContext, 'sessionId'>;

export async function requestDesktopFramedSyncDifferencesHttp(args:
  Omit<Parameters<typeof requestDesktopFramedSyncDifferenceHttp>[0], 'difference'> & {
    differences: readonly FramedSyncInventoryDifference[];
  }) {
  if (!args.differences.length || args.differences.length > FRAMED_SYNC_BATCH_LIMITS.maxItems) {
    throw new Error('framed_sync_batch_item_limit_exceeded');
  }
  let bytes = 0;
  const messages = args.differences.map(difference => {
    const projected = projectFramedSyncDifferenceRequest({ difference, roundId: args.roundId });
    bytes += projected.encoded.byteLength;
    if (bytes > FRAMED_SYNC_LIMITS.maxControlMessageBytes) throw new Error('framed_sync_batch_request_limit_exceeded');
    return { payload: projected.payload, payloadCase: 'difference_request' as const };
  });
  const body = await encodeDesktopFramedSyncSession({ authenticatedContext: args.context,
    groupKey: args.groupKey, messages, noncePort: args.noncePort,
    payloadBudget: args.db ? readFramedSyncPayloadBudget(args.db) : undefined });
  const budget = args.db ? readFramedSyncPayloadBudget(args.db) : undefined;
  const response = await postDesktopFramedSyncBytes(postInput(args, body));
  return readFramedSyncStreamSequence(response.response, budget);
}

export async function requestDesktopFramedSyncDifferenceHttp(args: {
  context: AuthenticatedContext;
  db?: DbPort;
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
  return postDifferenceRequest(args, projected.payload);
}

export async function requestDesktopFramedSyncResourcesHttp(args:
  Omit<Parameters<typeof requestDesktopFramedSyncDifferenceHttp>[0], 'difference'> & {
    db: DbPort;
    resources: readonly FramedSyncRequestedResource[];
  }) {
  const resources = readFramedSyncRequestedResources(args.resources);
  const payload = projectFramedSyncResourceRequest(resources, args.roundId);
  await args.db.transaction(async (tx) => {
    for (const resource of resources) await startFramedSyncResourceDemandRequest(tx, {
      ...resource, groupId: args.context.groupId, receiverDeviceId: args.context.initiatorDeviceId,
      receiverLibraryEpoch: args.context.initiatorLibraryEpoch
    }, resource.demandId, resource.sharedStateHash);
  });
  return postDifferenceRequest(args, payload);
}

async function postDifferenceRequest(args:
  Omit<Parameters<typeof requestDesktopFramedSyncDifferenceHttp>[0], 'difference'>, payload: unknown) {
  const body = await encodeDesktopFramedSyncSession({
    authenticatedContext: args.context,
    groupKey: args.groupKey,
    messages: [{ payload, payloadCase: 'difference_request' }],
    noncePort: args.noncePort,
    payloadBudget: args.db ? readFramedSyncPayloadBudget(args.db) : undefined
  });
  return (await postDesktopFramedSync(postInput(args, body))).stream;
}

function postInput(args: Omit<Parameters<typeof requestDesktopFramedSyncDifferenceHttp>[0], 'difference'>,
  body: Awaited<ReturnType<typeof encodeDesktopFramedSyncSession>>) {
  return {
    body,
    payloadBudget: args.db ? readFramedSyncPayloadBudget(args.db) : undefined,
    endpointUrl: args.endpointUrl,
    groupId: args.context.groupId,
    localDeviceId: args.context.initiatorDeviceId,
    localLibraryEpoch: args.context.initiatorLibraryEpoch,
    pathWithQuery: '/companion/framed-sync',
    remoteDeviceId: args.context.responderDeviceId,
    remoteLibraryEpoch: args.context.responderLibraryEpoch,
    secret: args.groupSecret
  };
}
