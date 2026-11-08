import type { FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';
import { respondAttachmentBatchDescriptions, respondAttachmentBatchPull } from '../../lib/core/sync/requestSyncAttachmentBatch.js';
import { ATTACHMENT_BATCH_DESCRIBE_OPERATION, ATTACHMENT_BATCH_PULL_OPERATION } from '../../lib/core/sync/requestSyncAttachmentContract.js';
import { respondRequestSyncAttachments } from '../../lib/core/sync/requestSyncAttachmentResponse.js';
import { respondRequestSyncDatabase } from '../../lib/core/sync/requestSyncDatabaseResponse.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { respondRequestSyncRoundControl } from '../../lib/core/sync/requestSyncPeerRound.js';
import type { RequestSyncAuthenticatedContext } from '../../lib/core/sync/requestSyncWire.js';

import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';
import { createDesktopRequestSyncAttachmentHost } from './desktopRequestSyncAttachmentHost.js';
import { prepareDesktopRequestSyncBody } from './desktopRequestSyncBody.js';
import { respondDesktopRequestSyncInventory } from './desktopRequestSyncInventoryHttp.js';
import { respondDesktopRequestSyncObject } from './desktopRequestSyncObjectHttp.js';
import { respondDesktopRequestSyncPull } from './desktopRequestSyncPullHttp.js';
import { readDesktopVerifiedMemberState } from './desktopSyncGroupMemberStateReadiness.js';

export async function respondDesktopRequestSyncHttp(host: RequestSyncDatabaseHost, input: {
  url: URL;
  context: RequestSyncAuthenticatedContext;
  stream: FramedSyncStreamBody<FramedSyncWireFrame>;
  groupKey: Uint8Array;
  signal: AbortSignal;
  onProgress?: () => void;
  payloadBudget?: FramedSyncPayloadBudget;
  consumePull?: (stream: FramedSyncStreamBody, signal?: AbortSignal, snapshot?: true) => Promise<void>;
}) {
  input.signal.throwIfAborted();
  switch (input.url.searchParams.get('request')) {
    case 'round_finish': return respondRequestSyncRoundControl({ ...input,
      onCompleted: host.databaseRoundCompleted, roundId: input.url.searchParams.get('peer_round_id') ?? '' });
    case ATTACHMENT_BATCH_DESCRIBE_OPERATION: return respondAttachmentBatchDescriptions(
      await createDesktopRequestSyncAttachmentHost(host), input, prepareDesktopRequestSyncBody);
    case ATTACHMENT_BATCH_PULL_OPERATION: {
      if (!input.consumePull) throw new Error('attachment_batch_stream_required');
      const signal = input.payloadBudget ? AbortSignal.any([input.signal, input.payloadBudget.signal]) : input.signal;
      return respondAttachmentBatchPull(await createDesktopRequestSyncAttachmentHost(host), { ...input, signal }, input.consumePull);
    }
    case 'attachments': return respondRequestSyncAttachments<FramedSyncStreamBody | void>(
      await createDesktopRequestSyncAttachmentHost(host), { ...input,
        signal: input.payloadBudget ? AbortSignal.any([input.signal, input.payloadBudget.signal]) : input.signal
      }, prepareDesktopRequestSyncBody);
    case 'inventory': return respondDesktopRequestSyncInventory(host, input);
    case 'pull': return respondDesktopRequestSyncPull(host, input);
    case 'pulls': return respondRequestSyncDatabase(host, { ...input, mode: 'pulls' }, prepareDesktopRequestSyncBody);
    case 'objects': return respondRequestSyncDatabase(host, { ...input, mode: 'objects', batch: {
      peerState: readDesktopVerifiedMemberState(input.context.initiatorDeviceId)
    } }, prepareDesktopRequestSyncBody);
    case 'object': {
      const objectType = input.url.searchParams.get('object_type');
      const globalId = input.url.searchParams.get('global_id');
      if (!objectType || !globalId) throw new Error('request_sync_object_identity_missing');
      return respondDesktopRequestSyncObject(host, { ...input, ...input.stream, author: 'initiator',
        peerState: readDesktopVerifiedMemberState(input.context.initiatorDeviceId),
        expectedObject: { objectType, globalId } });
    }
    default: throw new Error('request_sync_operation_invalid');
  }
}
