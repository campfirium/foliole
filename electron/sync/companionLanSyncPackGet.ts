import type http from 'node:http';

import { writeWorkgroupBinary } from './companionLanResponses.js';
import { buildCompanionSyncPackResource, SYNC_PACK_PATH } from './companionLanSyncPack.js';

export async function handleSyncPackGet(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  parsedRequestUrl: URL,
  authenticatedDeviceId: string,
  writeJson: (
    request: http.IncomingMessage,
    response: http.ServerResponse,
    statusCode: number,
    payload: unknown,
    methods?: string
  ) => void
) {
  if (parsedRequestUrl.pathname !== SYNC_PACK_PATH) {
    return false;
  }
  const resource = await buildCompanionSyncPackResource(parsedRequestUrl, authenticatedDeviceId);
  if (resource.status !== 'ready') {
    writeJson(request, response, resource.statusCode, { error: resource.error }, 'GET, OPTIONS');
    return true;
  }
  writeWorkgroupBinary(request, response, 200, resource.body ?? Buffer.alloc(0), 'application/zip');
  return true;
}
