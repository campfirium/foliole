import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import type { RequestSyncAuthenticatedContext } from '../../lib/core/sync/requestSyncWire.js';

import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';
import { respondDesktopRequestSyncInventory } from './desktopRequestSyncInventoryHttp.js';
import { respondDesktopRequestSyncObject } from './desktopRequestSyncObjectHttp.js';
import { respondDesktopRequestSyncPull } from './desktopRequestSyncPullHttp.js';
import { readDesktopVerifiedMemberState } from './desktopSyncGroupMemberStateReadiness.js';

export function respondDesktopRequestSyncHttp(host: RequestSyncDatabaseHost, input: {
  url: URL;
  context: RequestSyncAuthenticatedContext;
  stream: FramedSyncStreamBody<FramedSyncWireFrame>;
  groupKey: Uint8Array;
  signal: AbortSignal;
}) {
  input.signal.throwIfAborted();
  switch (input.url.searchParams.get('request')) {
    case 'inventory': return respondDesktopRequestSyncInventory(host, input);
    case 'pull': return respondDesktopRequestSyncPull(host, input);
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
