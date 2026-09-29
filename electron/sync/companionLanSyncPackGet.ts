import type http from 'node:http';

import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { writeWorkgroupFileStream } from './companionLanResponses.js';
import { buildCompanionSyncPackResource, SYNC_PACK_PATH } from './companionLanSyncPack.js';
import { createWorkgroupResponseStreamCipher } from './workgroupHttpCrypto.js';

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
  if (!parsedRequestUrl.searchParams.get('fact_index_id') &&
      !parsedRequestUrl.searchParams.get('dependency_view') &&
      !parsedRequestUrl.searchParams.get('fact_view')) {
    writeJson(request, response, 409, { error: 'sync_pack_fact_probe_required' }, 'GET, OPTIONS');
    return true;
  }
  let resource: Awaited<ReturnType<typeof buildCompanionSyncPackResource>>;
  try {
    resource = await runWithDatabaseConnectionOwner(() =>
      buildCompanionSyncPackResource(parsedRequestUrl, authenticatedDeviceId));
  } catch (error) {
    if (error instanceof Error &&
        (error.message.startsWith('sync_pack_fact_body_unavailable:') ||
          ['sync_pack_fact_index_changed', 'sync_pack_fact_claims_invalid',
            'sync_pack_source_view_unavailable'].includes(error.message))) {
      writeJson(request, response, 409, { error: error.message }, 'GET, OPTIONS');
      return true;
    }
    throw error;
  }
  if (resource.status !== 'ready') {
    await runWithDatabaseConnectionOwner(() =>
      writeJson(request, response, resource.statusCode, { error: resource.error }, 'GET, OPTIONS'));
    return true;
  }
  if (!resource.filePath || !resource.cleanup) throw new Error('sync_pack_file_unavailable');
  try {
    const cipher = await runWithDatabaseConnectionOwner(() =>
      createWorkgroupResponseStreamCipher(request, 'application/zip'));
    await writeWorkgroupFileStream(request, response, 200, {
      filePath: resource.filePath, mimeType: 'application/zip'
    }, cipher);
  } finally {
    await resource.cleanup();
  }
  return true;
}
