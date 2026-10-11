import type { RequestSyncExchange } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import type { RequestSyncAuthenticatedContext } from '../../lib/core/sync/requestSyncWire.js';

import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { prepareDesktopRequestSyncBody } from './desktopRequestSyncBody.js';

export function createDesktopRequestSyncExchange(input: {
  context: RequestSyncAuthenticatedContext;
  groupKey: Uint8Array;
  groupSecret: string;
  endpointUrl: string;
  signal?: AbortSignal;
}): RequestSyncExchange {
  return { ...input, request: async (pathWithQuery, stream, consume) => {
    const body = await prepareDesktopRequestSyncBody(stream);
    const { context } = input;
    const response = await postDesktopFramedSync({ body, endpointUrl: input.endpointUrl,
      groupId: context.groupId, localDeviceId: context.initiatorDeviceId,
      localLibraryEpoch: context.initiatorLibraryEpoch, remoteDeviceId: context.responderDeviceId,
      remoteLibraryEpoch: context.responderLibraryEpoch, secret: input.groupSecret, pathWithQuery,
      ...(input.signal ? { signal: input.signal } : {}) });
    return consume(response.stream);
  } };
}
