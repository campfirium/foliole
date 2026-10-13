import type http from 'node:http';

import {
  FRAMED_SYNC_FRAME_TYPES,
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext
} from '../../lib/core/sync/framedSyncContract.js';
import { createFramedSyncFileSessionNoncePort } from '../../lib/core/sync/framedSyncFileSession.js';
import { createFramedSyncFileStaging } from '../../lib/core/sync/framedSyncFileStaging.js';
import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { parseRequestSyncPeerRound, touchRequestSyncStream } from '../../lib/core/sync/requestSyncPeerRound.js';
import type { SyncPeerRoundLease } from '../../lib/core/sync/syncPeerRoundOwnership.js';
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
import { desktopSyncPeerRoundOwner } from './desktopSyncPeerRoundOwner.js';

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
  const round = url.searchParams.has('request') ? parseRequestSyncPeerRound(
    url.searchParams.get('peer_round_id'), url.searchParams.get('peer_round_mode')) : undefined;
  const { lease, ownershipError } = acquireInboundRound(runtime, round);
  const disconnected = () => {
    if (!args.response.writableFinished) controller.abort(new Error('request_sync_peer_disconnected'));
  };
  const completed = () => {
    if (round && lease && (round.mode === 'finish' || round.mode === 'single')) {
      desktopSyncPeerRoundOwner().finishInbound(runtime.auth.ok ? runtime.auth.device_id : '', round.id);
    }
  };
  args.response.once('finish', completed);
  args.request.once('aborted', disconnected);
  args.response.once('close', disconnected);
  if (args.request.aborted || args.response.destroyed) disconnected();
  try { await handleCompanionLanFramedSyncPost({
    authenticate: () => runtime.auth,
    payloadBudget: runtime.payloadBudget,
    localIdentity: { deviceId: args.deviceId, libraryEpoch: runtime.libraryEpoch },
    onProgress: () => lease?.touch(),
    onStream: async ({ context, stream }) => {
      if (url.searchParams.has('request')) {
        if (!round) throw new Error('sync_round_identity_missing');
        if (ownershipError) throw ownershipError;
        if (!lease) throw new Error('sync_round_identity_missing');
        const reply = await respondDesktopRequestSyncHttp(createDesktopRequestSyncDatabaseHost(runtime.databasePath), {
          context, stream: { ...stream, frames: touchRequestSyncStream(stream.frames, lease) },
          url, groupKey: runtime.groupKey, signal: AbortSignal.any([controller.signal, lease.signal]),
          onProgress: () => lease?.touch()
        });
        return { ...reply, frames: touchRequestSyncStream(reply.frames, lease) };
      }
      return respondLegacyStream(runtime, context, stream, noncePort, staging);
    },
    request: args.request,
    response: args.response
  }); } finally {
    args.response.off('finish', completed);
    args.request.off('aborted', disconnected);
    args.response.off('close', disconnected);
    if (round && lease && (round.mode === 'finish' || round.mode === 'single' ||
        controller.signal.aborted || (round.mode === 'start' && args.response.statusCode !== 200))) {
      desktopSyncPeerRoundOwner().finishInbound(runtime.auth.ok ? runtime.auth.device_id : '', round.id);
    }
  }
  return true;
}

function acquireInboundRound(runtime: Awaited<ReturnType<typeof loadInboundRuntime>>,
  round: ReturnType<typeof parseRequestSyncPeerRound> | undefined): {
    lease: SyncPeerRoundLease | undefined; ownershipError: unknown
  } {
  try {
    return { lease: round && runtime.auth.ok ? desktopSyncPeerRoundOwner().acceptInbound(
      runtime.auth.device_id, round.id, round.mode === 'start' || round.mode === 'single') : undefined,
    ownershipError: undefined };
  } catch (ownershipError) { return { lease: undefined, ownershipError }; }
}

async function respondLegacyStream(
  runtime: Awaited<ReturnType<typeof loadInboundRuntime>>,
  context: Omit<import('../../lib/core/sync/framedSyncSession.js').FramedSyncSessionContext, 'sessionId'>,
  stream: FramedSyncStreamBody<FramedSyncWireFrame>,
  noncePort: ReturnType<typeof createFramedSyncFileSessionNoncePort>,
  staging: ReturnType<typeof createFramedSyncFileStaging>
) {
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
