import type { IncomingMessage, ServerResponse } from 'node:http';

import { z } from 'zod';

import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadDesktopSyncGroupInfo } from '../database/syncGroupStore.js';

import { createLanWorkspaceSyncRequestHandler } from './companionLanRequestHandler.js';
import { createDesktopFramedSyncRoundProcessAdapter } from './desktopFramedSyncRoundProcessAdapter.js';
import { continueDesktopSyncGroupSync } from './desktopSyncGroupTransport.js';

type FactoryInput = Readonly<{ databasePath: string; fileStorage?: boolean; deviceId: string; localOrigin: string }>;

export async function createDesktopFramedSyncProcessPort(input: FactoryInput) {
  const connection = openDatabaseConnection();
  if (connection.dbPath !== input.databasePath) throw new Error('framed_sync_database_path_mismatch');
  const db = createBetterSqliteDbPort(connection.sqlite, { name: 'desktop-request-sync-process' });
  const group = loadDesktopSyncGroupInfo();
  if (!group) throw new Error('sync_group_not_available');
  const round = createDesktopFramedSyncRoundProcessAdapter({ db, groupId: group.group_id,
    local: { deviceId: input.deviceId, libraryEpoch: `${input.deviceId}-epoch` } });
  const productionHttp = createLanWorkspaceSyncRequestHandler({ appVersion: '0.7.14', deviceId: input.deviceId,
    onJoinRequestCreated: null, updateGroupStatus: () => undefined });
  return {
    handleHttpRequest: (request: IncomingMessage, response: ServerResponse) => productionHttp(request, response),
    round,
    synchronize: async ({ peerOrigin }: Readonly<{ nodeId?: string; peerOrigin: string }>) => {
      const response = await fetch(`${peerOrigin}/health`);
      if (!response.ok) throw new Error('framed_sync_fixture_peer_health_failed');
      const payload = z.object({ deviceId: z.string().min(1) }).parse(await response.json());
      return continueDesktopSyncGroupSync({ endpoint_url: peerOrigin, group_id: group.group_id,
        local_device_id: input.deviceId, peer_device_id: payload.deviceId,
        peer_device_name: payload.deviceId, peer_platform: 'desktop' });
    }
  };
}
