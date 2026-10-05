import type { IncomingMessage, ServerResponse } from 'node:http';

import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';
import { loadDesktopSyncGroupInfo } from '../database/syncGroupStore.js';

import { handleCompanionLanFramedSyncPost } from './companionLanFramedSyncPost.js';
import { synchronizeDesktopFramedSync } from './desktopFramedSyncProcessOutbound.js';
import { receiveDesktopFramedSyncTransfer } from './desktopFramedSyncProcessReceiver.js';
import { createDesktopFramedSyncRoundProcessAdapter } from './desktopFramedSyncRoundProcessAdapter.js';

type FactoryInput = Readonly<{ databasePath: string; deviceId: string; localOrigin: string }>;

export async function createDesktopFramedSyncProcessPort(input: FactoryInput) {
  const connection = openDatabaseConnection();
  if (connection.dbPath !== input.databasePath) throw new Error('framed_sync_database_path_mismatch');
  for (const statement of FRAMED_SYNC_STAGING_SCHEMA) connection.sqlite.exec(statement);
  const db = createBetterSqliteDbPort(connection.sqlite, { name: 'desktop-framed-sync-process' });
  const staging = createDesktopFramedSyncStaging(db);
  const identity = { deviceId: input.deviceId, libraryEpoch: `${input.deviceId}-epoch` };
  const group = loadDesktopSyncGroupInfo();
  if (!group) throw new Error('sync_group_not_available');
  const groupKey = new Uint8Array(Buffer.from(group.workgroup_key, 'base64url'));
  const round = createDesktopFramedSyncRoundProcessAdapter({
    db, groupId: group.group_id, local: identity, staging
  });
  return {
    handleHttpRequest: (request: IncomingMessage, response: ServerResponse) =>
      handleCompanionLanFramedSyncPost({
        localIdentity: identity,
        onStream: ({ context, stream }) => receiveDesktopFramedSyncTransfer({
          context: {
            groupId: context.groupId,
            protocolVersion: context.protocolVersion,
            receiverDeviceId: context.responderDeviceId,
            receiverLibraryEpoch: context.responderLibraryEpoch,
            senderDeviceId: context.initiatorDeviceId,
            senderLibraryEpoch: context.initiatorLibraryEpoch
          },
          db,
          groupKey,
          staging,
          stream
        }),
        request,
        response
      }),
    round,
    synchronize: ({ nodeId, peerOrigin }: Readonly<{ nodeId?: string; peerOrigin: string }>) =>
      synchronizeDesktopFramedSync({
        local: identity,
        ...(nodeId === undefined ? {} : { nodeId }),
        peerOrigin,
        staging
      })
  };
}
