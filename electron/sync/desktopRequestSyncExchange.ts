import type { RequestSyncExchange } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { requestSyncPeerRoundPath, touchRequestSyncStream, type RequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import type { RequestSyncAuthenticatedContext } from '../../lib/core/sync/requestSyncWire.js';

import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { prepareDesktopRequestSyncBody } from './desktopRequestSyncBody.js';

export function createDesktopRequestSyncExchange(input: {
  context: RequestSyncAuthenticatedContext;
  groupKey: Uint8Array;
  groupSecret: string;
  endpointUrl: string;
  signal?: AbortSignal;
  peerRound?: RequestSyncPeerRound;
}): RequestSyncExchange {
  const prepare: NonNullable<RequestSyncExchange['prepareRequest']> = async (pathWithQuery, stream) => {
    const body = await prepareDesktopRequestSyncBody({ ...stream,
      frames: touchRequestSyncStream(stream.frames, input.peerRound?.lease) });
    const { context } = input;
    return { dispose: async () => { await body.dispose?.(); }, async send(consume, options) {
      const signal = options?.signal ?? input.signal;
      const response = await postDesktopFramedSync({ body, endpointUrl: input.endpointUrl,
        groupId: context.groupId, localDeviceId: context.initiatorDeviceId,
        localLibraryEpoch: context.initiatorLibraryEpoch, remoteDeviceId: context.responderDeviceId,
        remoteLibraryEpoch: context.responderLibraryEpoch, secret: input.groupSecret,
        pathWithQuery: requestSyncPeerRoundPath(pathWithQuery, input.peerRound),
        ...(input.peerRound ? { onProgress: () => input.peerRound?.lease.touch() } : {}),
        ...(signal ? { signal } : {}) });
      try {
        if (input.peerRound) input.peerRound.admitted = true;
        return await consume({ ...response.stream, frames: touchRequestSyncStream(response.stream.frames, input.peerRound?.lease) });
      } finally { await response.stream.frames[Symbol.asyncIterator]().return?.(); }
    } };
  };
  return { ...input, prepareRequest: prepare, request: async (path, stream, consume, options) => {
    const request = await prepare(path, stream);
    try { return await request.send(consume, options); } finally { await request.dispose(); }
  } };
}
