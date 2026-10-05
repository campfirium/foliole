import type http from 'node:http';

import {
  FRAMED_SYNC_FRAME_TYPES,
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext
} from '../../lib/core/sync/framedSyncContract.js';
import { decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';
import { loadDesktopLocalNodeProof } from '../database/nodeVersionPeerProof.js';
import { loadDesktopSyncGroupInfo } from '../database/syncGroupStore.js';

import {
  FRAMED_SYNC_PATH,
  handleCompanionLanFramedSyncPost
} from './companionLanFramedSyncPost.js';
import { authenticateCompanionRequest } from './companionRequestAuth.js';
import { respondDesktopFramedSyncInventory } from './desktopFramedSyncInventoryHttp.js';
import { receiveDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import { receiveDesktopFramedSyncReceipt } from './desktopFramedSyncReceiptReceiver.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';

export async function handleProductionCompanionFramedSyncPost(args: {
  deviceId: string;
  request: http.IncomingMessage;
  response: http.ServerResponse;
}) {
  const pathname = new URL(args.request.url ?? '/', 'http://127.0.0.1').pathname;
  if (args.request.method !== 'POST' || pathname !== FRAMED_SYNC_PATH) return false;

  const runtime = await runWithDatabaseConnectionOwner(() => {
    const connection = openDatabaseConnection();
    const group = loadDesktopSyncGroupInfo();
    if (!group) throw new Error('sync_group_not_available');
    return {
      auth: authenticateCompanionRequest({ request: args.request, requireMemberState: true }),
      db: createBetterSqliteDbPort(connection.sqlite, { name: 'desktop-framed-sync-lan' }),
      groupKey: new Uint8Array(Buffer.from(group.workgroup_key, 'base64url')),
      libraryEpoch: loadDesktopLocalNodeProof().library_epoch
    };
  });
  const staging = createDesktopFramedSyncStaging(runtime.db);
  const noncePort = createDesktopFramedSyncSessionNoncePort(runtime.db);
  await handleCompanionLanFramedSyncPost({
    authenticate: () => runtime.auth,
    localIdentity: { deviceId: args.deviceId, libraryEpoch: runtime.libraryEpoch },
    onStream: async ({ context, stream }) => {
      const preamble = decodeFramedSyncPreamble(stream.preamble);
      if (preamble.contextKind === 'session') return respondDesktopFramedSyncInventory({
        context, db: runtime.db, groupKey: runtime.groupKey,
        groupSecret: Buffer.from(runtime.groupKey).toString('base64url'), noncePort, staging, stream
      });
      const inspected = await inspectFirstFrame(stream);
      const transferContext = toTransferContext(context);
      if (inspected.first.header.frameType === FRAMED_SYNC_FRAME_TYPES.transferReceipt) {
        return receiveDesktopFramedSyncReceipt({
          context: transferContext,
          db: runtime.db, groupKey: runtime.groupKey, staging,
          stream: inspected.stream, transferId: preamble.contextId
        });
      }
      return receiveDesktopFramedSyncTransfer({
        context: transferContext,
        db: runtime.db,
        groupKey: runtime.groupKey,
        staging,
        stream: inspected.stream
      });
    },
    request: args.request,
    response: args.response
  });
  return true;
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
    yield first;
    for (;;) {
      const value = await iterator.next();
      if (value.done) return;
      yield value.value;
    }
  }
  return { first, stream: { frames: frames(), preamble: stream.preamble } };
}
