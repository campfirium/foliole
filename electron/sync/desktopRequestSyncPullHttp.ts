import type { FramedSyncStreamBody, FramedSyncWireFrame } from '../../lib/core/sync/framedSyncBinaryStream.js';
import { pullRequestSyncObject } from '../../lib/core/sync/requestSyncDatabaseExchange.js';
import { respondRequestSyncDatabase } from '../../lib/core/sync/requestSyncDatabaseResponse.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import type { RequestSyncAuthenticatedContext } from '../../lib/core/sync/requestSyncWire.js';
import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';

import { spoolDesktopFramedSyncBody } from './desktopFramedSyncBodySpool.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import type { postDesktopRequestSyncObject } from './desktopRequestSyncObjectHttp.js';

export async function pullDesktopRequestSyncObject(host: RequestSyncDatabaseHost,
  input: Parameters<typeof postDesktopRequestSyncObject>[1] & { peerState: SyncGroupMemberStatePayload }) {
  return pullRequestSyncObject(host, createDesktopRequestSyncExchange(input), input.difference, { peerState: input.peerState });
}

export async function respondDesktopRequestSyncPull(host: RequestSyncDatabaseHost, input: {
  context: RequestSyncAuthenticatedContext;
  groupKey: Uint8Array;
  signal?: AbortSignal;
  stream: FramedSyncStreamBody<FramedSyncWireFrame>;
}) {
  return respondRequestSyncDatabase(host, { ...input, mode: 'pull' }, spoolDesktopFramedSyncBody);
}
