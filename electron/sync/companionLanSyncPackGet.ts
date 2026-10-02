import type http from 'node:http';

import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { writeWorkgroupFileStream } from './companionLanResponses.js';
import { buildCompanionSyncPackResource, SYNC_PACK_PATH } from './companionLanSyncPack.js';
import { recordDesktopSyncActivity } from './desktopSyncActivityStore.js';
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
            'sync_pack_source_view_unavailable', 'sync_pack_upgrade_required'].includes(error.message))) {
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
  await sendPackResource(request, response, resource, authenticatedDeviceId);
  return true;
}

async function sendPackResource(request: http.IncomingMessage, response: http.ServerResponse,
  resource: Awaited<ReturnType<typeof buildCompanionSyncPackResource>>, authenticatedDeviceId: string) {
  if (!resource.filePath || !resource.cleanup) throw new Error('sync_pack_file_unavailable');
  const activity = resource.activityPackId ? {
    runId: `outbound:${authenticatedDeviceId}:${resource.activityPackId}`, startedAt: new Date().toISOString()
  } : undefined;
  const peer = { peer_device_id: authenticatedDeviceId, peer_device_name: '' };
  if (activity) await recordDesktopSyncActivity(activity, { direction: 'send', kind: 'run_started',
    message: 'Sending sync data', stage: 'sync_pack', status: 'started' }, peer);
  try {
    const cipher = await runWithDatabaseConnectionOwner(() =>
      createWorkgroupResponseStreamCipher(request, 'application/zip'));
    await writeWorkgroupFileStream(request, response, 200, {
      filePath: resource.filePath, mimeType: 'application/zip'
    }, cipher);
    if (activity) await recordDesktopSyncActivity(activity, { direction: 'send', kind: 'run_finished',
      message: 'Sync data sent; awaiting version confirmation', result: 'waiting', stage: 'sync_pack',
      status: 'skipped', confirmation: 'sent' }, peer);
  } catch (error) {
    if (activity) await recordDesktopSyncActivity(activity, { direction: 'send', kind: 'run_finished',
      message: error instanceof Error ? error.message : String(error), result: 'failed',
      stage: 'sync_pack', status: 'failed' }, peer);
    throw error;
  } finally {
    await resource.cleanup();
  }
}
