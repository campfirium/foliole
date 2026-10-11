import type http from 'node:http';

import {
  FRAMED_SYNC_FRAME_TYPES,
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext
} from '../../lib/core/sync/framedSyncContract.js';
import { createFramedSyncFileSessionNoncePort } from '../../lib/core/sync/framedSyncFileSession.js';
import { createFramedSyncFileStaging } from '../../lib/core/sync/framedSyncFileStaging.js';
import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadDesktopLocalNodeProof } from '../database/nodeVersionPeerProof.js';
import { loadDesktopSyncGroupInfo } from '../database/syncGroupStore.js';

import {
  FRAMED_SYNC_BODY_SHA256_HEADER,
  FRAMED_SYNC_PATH,
  handleCompanionLanFramedSyncPost
} from './companionLanFramedSyncPost.js';
import { authenticateCompanionRequest } from './companionRequestAuth.js';
import { createDesktopLibrarySyncFiles } from './desktopFramedSyncFiles.js';
import { respondDesktopFramedSyncInventory } from './desktopFramedSyncInventoryHttp.js';
import { receiveDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import { receiveDesktopFramedSyncReceipt } from './desktopFramedSyncReceiptReceiver.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';
import { createDesktopRequestSyncDatabaseHost } from './desktopRequestSyncDatabaseHost.js';
import { respondDesktopRequestSyncHttp } from './desktopRequestSyncHttpRoute.js';

export async function handleProductionCompanionFramedSyncPost(args: {
  deviceId: string;
  request: http.IncomingMessage;
  response: http.ServerResponse;
}) {
  const url = new URL(args.request.url ?? '/', 'http://127.0.0.1');
  if (args.request.method !== 'POST' || url.pathname !== FRAMED_SYNC_PATH) return false;

  const runtime = await loadInboundRuntime(args.request);
  const staging = createFramedSyncFileStaging(runtime.files);
  const noncePort = createFramedSyncFileSessionNoncePort(runtime.files);
  const controller = new AbortController();
  const disconnected = () => {
    if (!args.response.writableFinished) controller.abort(new Error('request_sync_peer_disconnected'));
  };
  args.request.once('aborted', disconnected);
  args.response.once('close', disconnected);
  if (args.request.aborted || args.response.destroyed) disconnected();
  try { await handleCompanionLanFramedSyncPost({
    authenticate: () => runtime.auth,
    payloadBudget: runtime.payloadBudget,
    localIdentity: { deviceId: args.deviceId, libraryEpoch: runtime.libraryEpoch },
    onStream: async ({ context, stream }) => {
      if (url.searchParams.has('request')) {
        return respondDesktopRequestSyncHttp(createDesktopRequestSyncDatabaseHost(runtime.databasePath), {
          context, stream, url, groupKey: runtime.groupKey, signal: controller.signal
        });
      }
      const preamble = decodeFramedSyncPreamble(stream.preamble);
      if (preamble.contextKind === 'session') return respondDesktopFramedSyncInventory({
        files: runtime.files, context, db: runtime.db, groupKey: runtime.groupKey,
        groupSecret: Buffer.from(runtime.groupKey).toString('base64url'), noncePort, staging, stream
      });
      const inspected = await inspectFirstFrame(stream);
      const transferContext = toTransferContext(context);
      if (inspected.first.header.frameType === FRAMED_SYNC_FRAME_TYPES.transferReceipt) {
        return receiveDesktopFramedSyncReceipt({
          files: runtime.files, context: transferContext,
          db: runtime.db, groupKey: runtime.groupKey, staging,
          stream: inspected.stream, transferId: preamble.contextId
        });
      }
      return receiveDesktopFramedSyncTransfer({
        files: runtime.files, context: transferContext,
        db: runtime.db,
        groupKey: runtime.groupKey,
        staging,
        stream: inspected.stream
      });
    },
    request: args.request,
    response: args.response
  }); } finally {
    args.request.off('aborted', disconnected);
    args.response.off('close', disconnected);
  }
  return true;
}

function readHeader(request: http.IncomingMessage, name: string) {
  const value = request.headers[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toTransferContext(context: Readonly<{
  groupId: string;
  initiatorDeviceId: string;
  initiatorLibraryEpoch: string;
  protocolVersion: number;
  responderDeviceId: string;
  responderLibraryEpoch: string;
}>): FramedSyncContext {
  if (context.protocolVersion !== FRAMED_SYNC_PROTOCOL_VERSION) {
    throw new Error('framed_sync_protocol_version_invalid');
  }
  return {
    groupId: context.groupId,
    protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    receiverDeviceId: context.responderDeviceId,
    receiverLibraryEpoch: context.responderLibraryEpoch,
    senderDeviceId: context.initiatorDeviceId,
    senderLibraryEpoch: context.initiatorLibraryEpoch
  };
}

async function inspectFirstFrame(stream: FramedSyncStreamBody<FramedSyncWireFrame>) {
  const iterator = stream.frames[Symbol.asyncIterator]();
  const next = await iterator.next();
  if (next.done) throw new Error('framed_sync_frame_missing');
  const first = next.value;
  async function* frames() {
    try {
      yield first;
      for (;;) {
        const value = await iterator.next();
        if (value.done) return;
        yield value.value;
      }
    } finally { await iterator.return?.(); }
  }
  return { first, stream: { frames: frames(), preamble: stream.preamble } };
}

function loadInboundRuntime(request: http.IncomingMessage) {
  return runWithDatabaseConnectionOwner(() => {
    const connection = openDatabaseConnection();
    const group = loadDesktopSyncGroupInfo();
    if (!group) throw new Error('sync_group_not_available');
    const bodySha256 = readHeader(request, FRAMED_SYNC_BODY_SHA256_HEADER);
    return {
      databasePath: connection.dbPath,
      files: createDesktopLibrarySyncFiles(connection.dbPath),
      payloadBudget: connection.framedSyncPayloadBudget,
      auth: authenticateCompanionRequest({
        ...(bodySha256 === undefined ? {} : { bodySha256 }),
        request: request,
        requireMemberState: true
      }),
      db: createBetterSqliteDbPort(connection.sqlite, { name: 'desktop-framed-sync-lan' }),
      groupKey: new Uint8Array(Buffer.from(group.workgroup_key, 'base64url')),
      libraryEpoch: loadDesktopLocalNodeProof().library_epoch
    };
  });
}
