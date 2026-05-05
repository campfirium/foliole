import type http from 'node:http';

import { buildCompanionSyncPackResource, SYNC_PACK_PATH } from './companionLanSyncPack.js';

export async function handleSyncPackGet(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  parsedRequestUrl: URL,
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
  const resource = await buildCompanionSyncPackResource(parsedRequestUrl);
  if (resource.status !== 'ready') {
    writeJson(request, response, resource.statusCode, { error: resource.error }, 'GET, OPTIONS');
    return true;
  }
  response.writeHead(200, {
    'Content-Disposition': `attachment; filename="${resource.fileName ?? 'sync-pack.syncpack'}"`,
    'Content-Length': resource.body?.byteLength ?? 0,
    'Content-Type': 'application/zip'
  });
  response.end(resource.body);
  return true;
}
