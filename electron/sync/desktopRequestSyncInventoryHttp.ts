import type { FramedSyncStreamBody, FramedSyncWireFrame } from '../../lib/core/sync/framedSyncBinaryStream.js';
import type { FramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventory.js';
import { exchangeRequestSyncInventory } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { respondRequestSyncDatabase } from '../../lib/core/sync/requestSyncDatabaseResponse.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import type { RequestSyncAuthenticatedContext } from '../../lib/core/sync/requestSyncWire.js';

import { spoolDesktopFramedSyncBody } from './desktopFramedSyncBodySpool.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import type { postDesktopRequestSyncObject } from './desktopRequestSyncObjectHttp.js';

export async function exchangeDesktopRequestSyncInventory(host: RequestSyncDatabaseHost,
  input: Omit<Parameters<typeof postDesktopRequestSyncObject>[1], 'difference'> & {
    localInventory?: readonly FramedSyncInventoryEntry[];
  }) {
  return exchangeRequestSyncInventory(host, createDesktopRequestSyncExchange(input), input.localInventory);
}

export async function respondDesktopRequestSyncInventory(host: RequestSyncDatabaseHost, input: {
  context: RequestSyncAuthenticatedContext;
  groupKey: Uint8Array;
  signal?: AbortSignal;
  stream: FramedSyncStreamBody<FramedSyncWireFrame>;
}) {
  return respondRequestSyncDatabase(host, { ...input, mode: 'inventory' }, spoolDesktopFramedSyncBody);
}
