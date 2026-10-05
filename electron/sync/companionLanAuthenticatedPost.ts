import type http from 'node:http';

import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { refreshKeepImportMonitorFromSettings } from '../import/keepImportMonitor.js';

import { readCompanionRequestBody } from './companionLanRequestBody.js';
import { isRetiredSyncJsonEndpoint } from './companionLanSyncObjects.js';
import { authenticateCompanionRequest } from './companionRequestAuth.js';
import {
  acceptDesktopSyncGroupMemberState,
  SYNC_GROUP_MEMBER_STATE_PATH
} from './desktopSyncGroupMemberState.js';
import { notifyDesktopSyncGroupOverviewChanged } from './desktopSyncGroupOverviewNotifier.js';
import { handleReadwiseGroupSetup, READWISE_GROUP_SETUP_PATH } from './readwiseGroupSetup.js';
import { handleReadwiseOwnerStop, READWISE_OWNER_STOP_PATH } from './readwiseOwnerStop.js';
import { decryptWorkgroupRequestBody } from './workgroupHttpCrypto.js';

const RETIRED_DATA_PATHS = new Set([
  '/companion/content-blob-ack',
  '/companion/content-blobs',
  '/companion/resource-availability',
  '/companion/sync-identity-pack',
  '/companion/sync-identity-push',
  '/companion/sync-push',
  '/companion/version-pack-receipt'
]);

type WriteJson = (
  request: http.IncomingMessage,
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
  methods?: string
) => void;

function resolveAuthenticatedPostRoute(url: URL) {
  if (url.pathname === READWISE_GROUP_SETUP_PATH) return 'readwise-group-setup';
  if (url.pathname === READWISE_OWNER_STOP_PATH) return 'readwise-owner-stop';
  if (url.pathname === SYNC_GROUP_MEMBER_STATE_PATH) return 'member-state';
  if (RETIRED_DATA_PATHS.has(url.pathname) || isRetiredSyncJsonEndpoint(url)) return 'retired';
  return null;
}

async function publishMemberStateEffects() {
  notifyDesktopSyncGroupOverviewChanged();
  setImmediate(() => { void refreshKeepImportMonitorFromSettings(); });
}

async function writeRouteResponse(args: {
  auth: Extract<ReturnType<typeof authenticateCompanionRequest>, { ok: true }>;
  bodyText: string;
  request: http.IncomingMessage;
  response: http.ServerResponse;
  route: NonNullable<ReturnType<typeof resolveAuthenticatedPostRoute>>;
  writeJson: WriteJson;
}) {
  const { auth, bodyText, request, response, route, writeJson } = args;
  if (route === 'retired') {
    writeJson(request, response, 410, { error: 'framed_sync_required' }, 'POST, OPTIONS');
    return;
  }
  if (route === 'readwise-owner-stop') {
    try {
      writeJson(request, response, 200, handleReadwiseOwnerStop(bodyText, auth.device_id),
        'POST, OPTIONS');
    } catch (error) {
      writeJson(request, response, 409, {
        error: error instanceof Error ? error.message : 'readwise_stop_failed'
      }, 'POST, OPTIONS');
    }
    return;
  }
  if (route === 'readwise-group-setup') {
    try {
      writeJson(request, response, 200,
        await handleReadwiseGroupSetup(bodyText, auth.device_id), 'POST, OPTIONS');
    } catch (error) {
      writeJson(request, response, 409, {
        error: error instanceof Error ? error.message : 'readwise_group_setup_failed'
      }, 'POST, OPTIONS');
    }
    return;
  }
  try {
    const applied = acceptDesktopSyncGroupMemberState(bodyText, auth.device_id);
    writeJson(request, response, 200, applied.state, 'POST, OPTIONS');
    await publishMemberStateEffects();
    if (applied.localExited) {
      setImmediate(() => {
        void import('./lanWorkspaceSyncServer.js').then(({ stopLanWorkspaceSyncServer }) =>
          stopLanWorkspaceSyncServer());
      });
    }
  } catch (error) {
    writeJson(request, response, 400, {
      error: error instanceof Error ? error.message : 'sync_group_member_state_invalid'
    }, 'POST, OPTIONS');
  }
}

export async function handleAuthenticatedPost(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  parsedRequestUrl: URL,
  writeJson: WriteJson
) {
  const route = resolveAuthenticatedPostRoute(parsedRequestUrl);
  if (!route) {
    writeJson(request, response, 404, { error: 'not_found' }, 'POST, OPTIONS');
    return true;
  }
  if (route === 'retired') {
    writeJson(request, response, 410, { error: 'framed_sync_required' }, 'POST, OPTIONS');
    return true;
  }
  let bodyText: string;
  try {
    bodyText = await readCompanionRequestBody(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_request_body';
    writeJson(request, response, message === 'request_too_large' ? 413 : 400,
      { error: message }, 'POST, OPTIONS');
    return true;
  }
  const auth = await runWithDatabaseConnectionOwner(() => authenticateCompanionRequest({
    allowUnknownDevice: route === 'member-state', bodyText, request,
    requireMemberState: route !== 'member-state'
  }));
  if (!auth.ok) {
    writeJson(request, response, auth.status_code, { error: auth.error }, 'POST, OPTIONS');
    return true;
  }
  let decryptedBody: string;
  try {
    decryptedBody = decryptWorkgroupRequestBody(request, bodyText).toString('utf8');
  } catch (error) {
    writeJson(request, response, 401, {
      error: error instanceof Error ? error.message : 'workgroup_aead_invalid'
    });
    return true;
  }
  await runWithDatabaseConnectionOwner(() => writeRouteResponse({
    auth, bodyText: decryptedBody, request, response, route, writeJson
  }));
  return true;
}
