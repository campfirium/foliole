import type { IncomingMessage, ServerResponse } from 'node:http';

import { z } from 'zod';

import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';
import { loadDesktopSyncGroupInfo } from '../database/syncGroupStore.js';

import { handleCompanionLanFramedSyncPost } from './companionLanFramedSyncPost.js';
import { createDesktopFramedSyncFixtureReceiver } from './desktopFramedSyncFixtureReceiver.js';
import { synchronizeDesktopFramedSync } from './desktopFramedSyncProcessOutbound.js';
import { createDesktopFramedSyncRoundProcessAdapter } from './desktopFramedSyncRoundProcessAdapter.js';
import { saveDesktopSyncGroupRoute } from './desktopSyncGroupRoutes.js';

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
    db, groupId: group.group_id, groupSecret: group.workgroup_key, local: identity, staging
  });
  const receiver = createDesktopFramedSyncFixtureReceiver({ db, groupKey,
    groupSecret: group.workgroup_key, staging });
  return {
    handleHttpRequest: (request: IncomingMessage, response: ServerResponse) =>
      handleCompanionLanFramedSyncPost({
        localIdentity: identity,
        onStream: receiver.receive,
        request,
        response
      }),
    round: async (value: unknown) => {
      if (z.object({ kind: z.literal('pause_before_apply') }).safeParse(value).success) {
        receiver.pauseBeforeApply();
        return null;
      }
      return round(value);
    },
    synchronize: async ({ nodeId, peerOrigin }: Readonly<{ nodeId?: string; peerOrigin: string }>) => {
      const remoteDeviceId = await fetchFixturePeerDeviceId(peerOrigin);
      saveDesktopSyncGroupRoute({ endpoint_url: peerOrigin, group_id: group.group_id,
        local_device_id: identity.deviceId, peer_device_id: remoteDeviceId,
        peer_device_name: remoteDeviceId, peer_platform: 'desktop' });
      return synchronizeDesktopFramedSync({
        db,
        groupId: group.group_id,
        groupSecret: group.workgroup_key,
        local: identity,
        ...(nodeId === undefined ? {} : { nodeId }),
        peerOrigin,
        remote: { deviceId: remoteDeviceId, libraryEpoch: `${remoteDeviceId}-epoch` },
        staging
      });
    }
  };
}

async function fetchFixturePeerDeviceId(peerOrigin: string) {
  const response = await fetch(`${peerOrigin}/health`);
  if (!response.ok) throw new Error('framed_sync_fixture_peer_health_failed');
  const payload = await response.json() as Record<string, unknown>;
  if (typeof payload.deviceId !== 'string' || !payload.deviceId) {
    throw new Error('framed_sync_fixture_peer_identity_missing');
  }
  return payload.deviceId;
}
