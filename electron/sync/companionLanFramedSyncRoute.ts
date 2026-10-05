import type http from 'node:http';

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
    onStream: ({ context, stream }) => decodeFramedSyncPreamble(stream.preamble).contextKind === 'session'
      ? respondDesktopFramedSyncInventory({ context, db: runtime.db, groupKey: runtime.groupKey,
        groupSecret: Buffer.from(runtime.groupKey).toString('base64url'), noncePort, staging, stream })
      : receiveDesktopFramedSyncTransfer({
        context: {
          groupId: context.groupId,
          protocolVersion: context.protocolVersion,
          receiverDeviceId: context.responderDeviceId,
          receiverLibraryEpoch: context.responderLibraryEpoch,
          senderDeviceId: context.initiatorDeviceId,
          senderLibraryEpoch: context.initiatorLibraryEpoch
        },
        db: runtime.db,
        groupKey: runtime.groupKey,
        staging,
        stream
      }),
    request: args.request,
    response: args.response
  });
  return true;
}
