import type { RequestSyncExchange } from '../../../../../../lib/core/sync/requestSyncDatabaseExchange.js';
import type { RequestSyncDatabaseHost } from '../../../../../../lib/core/sync/requestSyncObjectEndpoint.js';
import type { RequestSyncPeerRound } from '../../../../../../lib/core/sync/requestSyncPeerRound.js';
import type { RequestSyncAuthenticatedContext } from '../../../../../../lib/core/sync/requestSyncWire.js';

import { companionReceiveAttachment } from './companionAttachmentHttp.js';
import { withCompanionRequestSyncHttp } from './companionRequestSyncHttp.js';

export function createCompanionRequestSyncExchange(host: RequestSyncDatabaseHost, input: {
  context: RequestSyncAuthenticatedContext;
  groupKey: Uint8Array;
  endpointUrl: string;
  signal?: AbortSignal;
  peerRound?: RequestSyncPeerRound;
}): RequestSyncExchange {
  return { ...input, receiveAttachment: companionReceiveAttachment(host.files, input), request: (pathWithQuery, body, consume) =>
    withCompanionRequestSyncHttp(host.files, { ...input, pathWithQuery, body }, consume) };
}
