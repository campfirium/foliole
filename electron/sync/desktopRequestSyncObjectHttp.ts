import type { FramedSyncInventoryDifference } from '../../lib/core/sync/framedSyncInventory.js';
import { pushRequestSyncObject } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { respondRequestSyncDatabase } from '../../lib/core/sync/requestSyncDatabaseResponse.js';
import { receiveRequestSyncObject,
  type RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import type { RequestSyncAuthenticatedContext } from '../../lib/core/sync/requestSyncWire.js';

import { prepareDesktopRequestSyncBody } from './desktopRequestSyncBody.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';

export async function postDesktopRequestSyncObject(host: RequestSyncDatabaseHost, input: {
  context: RequestSyncAuthenticatedContext;
  difference: FramedSyncInventoryDifference;
  endpointUrl: string;
  groupKey: Uint8Array;
  groupSecret: string;
  signal?: AbortSignal;
}) {
  return pushRequestSyncObject(host, createDesktopRequestSyncExchange(input), input.difference);
}

export async function respondDesktopRequestSyncObject(host: RequestSyncDatabaseHost,
  input: Parameters<typeof receiveRequestSyncObject>[1]) {
  const { context, groupKey, peerState, expectedObject, signal } = input;
  return respondRequestSyncDatabase(host, { context, groupKey, mode: 'object',
    stream: { preamble: input.preamble, frames: input.frames }, object: { peerState, expectedObject },
    ...(signal ? { signal } : {}) }, prepareDesktopRequestSyncBody);
}
