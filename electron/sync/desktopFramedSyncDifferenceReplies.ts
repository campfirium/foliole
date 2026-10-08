import { FRAMED_SYNC_BATCH_LIMITS } from '../../lib/core/sync/framedSyncBatchLimits.js';
import { isFramedSyncPublicationBatchReady } from '../../lib/core/sync/framedSyncBatchReadiness.js';
import { decodeFramedSyncDifferenceRequest, resolveFramedSyncDifferenceRequest } from '../../lib/core/sync/framedSyncDifferenceRequest.js';
import type { FramedSyncInventoryDifference } from '../../lib/core/sync/framedSyncInventory.js';
import type { ValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
import type { OutboundPublishInput } from '../../lib/core/sync/framedSyncStagingContract.js';
import { publishDesktopFramedSyncNodeOutbound } from '../database/desktopFramedSyncOutboundSelection.js';
import { readFramedSyncPayloadBudget } from '../database/framedSyncPayloadBudgetOwner.js';

import type { respondDesktopFramedSyncInventory } from './desktopFramedSyncInventoryHttp.js';
import { prepareDesktopFramedSyncPublishedDelivery } from './desktopFramedSyncProcessOutbound.js';
import { publishDesktopFramedSyncResourceOutbound } from './desktopFramedSyncResourceOutbound.js';
import { readDesktopFramedSyncRoundInventoryEntry } from './desktopFramedSyncRoundInventory.js';
import { spoolDesktopFramedSyncSequence } from './desktopFramedSyncSequenceSpool.js';

type Args = Parameters<typeof respondDesktopFramedSyncInventory>[0];
type Request = ReturnType<typeof decodeFramedSyncDifferenceRequest>;

/** Validate the complete session before sealing any original per-object transfer. */
export async function respondDesktopFramedSyncDifferenceRequests(args: Args & {
  requests: readonly ValidatedProtocolMessage[];
}) {
  if (!args.requests.length || args.requests.length > FRAMED_SYNC_BATCH_LIMITS.maxItems) {
    throw new Error('framed_sync_difference_request_count_invalid');
  }
  const requests = args.requests.map(decodeFramedSyncDifferenceRequest);
  validateRequestIdentities(requests);
  const differences: FramedSyncInventoryDifference[] = [];
  for (const request of requests) {
    if (request.resources.length) continue;
    const first = request.facts[0];
    if (!first) throw new Error('framed_sync_difference_request_fact_required');
    const current = await readDesktopFramedSyncRoundInventoryEntry(args.db, first);
    if (!current) throw new Error('framed_sync_difference_request_source_missing');
    differences.push(resolveFramedSyncDifferenceRequest(current, request));
  }
  const first = requests[0]!;
  if (first.resources.length) {
    const publication = await publishDesktopFramedSyncResourceOutbound({
      db: args.db, resources: first.resources, context: outboundContext(args)
    });
    return (await prepareReply(args, publication)).body;
  }
  if (differences.length === 1) {
    return (await prepareReply(args, await selectPublication(args, differences[0]!))).body;
  }
  return spoolDesktopFramedSyncSequence({ bodies: replyPrefix(args, differences),
    lane: 'payload', payloadBudget: readFramedSyncPayloadBudget(args.db) });
}

function validateRequestIdentities(requests: readonly Request[]) {
  const roundId = requests[0]!.roundId;
  const objects = new Set<string>();
  for (const request of requests) {
    if (request.roundId.length !== roundId.length || request.roundId.some((byte, index) => byte !== roundId[index])) {
      throw new Error('inventory_round_identity_mismatch');
    }
    if (request.resources.length) {
      if (requests.length !== 1) throw new Error('framed_sync_database_request_required');
      continue;
    }
    const first = request.facts[0];
    if (!first) throw new Error('framed_sync_difference_request_fact_required');
    const identity = JSON.stringify([first.objectType, first.globalId]);
    if (objects.has(identity)) throw new Error('framed_sync_difference_request_identity_duplicate');
    objects.add(identity);
  }
}

async function* replyPrefix(args: Args, differences: readonly FramedSyncInventoryDifference[]) {
  let count = 0;
  let bytes = 0;
  for (const difference of differences) {
    const publication = await selectPublication(args, difference);
    const ready = isFramedSyncPublicationBatchReady(publication);
    if (count && !ready) return;
    const { body } = await prepareReply(args, publication);
    const size = body.uncompressedMessageBytes;
    if (count && (!ready || size === undefined || bytes + size > FRAMED_SYNC_BATCH_LIMITS.targetMessageBytes ||
        bytes + size > FRAMED_SYNC_BATCH_LIMITS.maxMessageBytes)) {
      await body.dispose?.();
      return;
    }
    count++;
    bytes += size ?? 0;
    yield body;
    if (!ready || size === undefined || size >= FRAMED_SYNC_BATCH_LIMITS.targetMessageBytes) return;
  }
}

async function selectPublication(args: Args, difference: FramedSyncInventoryDifference) {
  const selection = await publishDesktopFramedSyncNodeOutbound({
    context: outboundContext(args), difference, port: args.db,
    readCurrentInventoryEntry: (tx, key) => readDesktopFramedSyncRoundInventoryEntry(tx, key)
  });
  if (selection.kind === 'deferred') throw new Error('framed_sync_source_changed');
  return selection.publication;
}

function prepareReply(args: Args, publication: OutboundPublishInput) {
  return prepareDesktopFramedSyncPublishedDelivery({
    db: args.db, groupSecret: args.groupSecret, publication, staging: args.staging
  });
}

function outboundContext(args: Args) {
  return {
    groupId: args.context.groupId, protocolVersion: args.context.protocolVersion,
    receiverDeviceId: args.context.initiatorDeviceId, receiverLibraryEpoch: args.context.initiatorLibraryEpoch,
    senderDeviceId: args.context.responderDeviceId, senderLibraryEpoch: args.context.responderLibraryEpoch
  };
}
