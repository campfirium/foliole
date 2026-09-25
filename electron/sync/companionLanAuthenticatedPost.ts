import type http from 'node:http';

import { RESOURCE_AVAILABILITY_PATH } from '../../lib/platform/resourceAvailabilityContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import {
  acknowledgeCompanionContentBlobs,
  CONTENT_BLOB_ACK_PATH,
  CONTENT_BLOB_BATCH_PATH,
  loadCompanionContentBlobBatch
} from './companionLanContentBlobs.js';
import { readCompanionRequestBody } from './companionLanRequestBody.js';
import { writeWorkgroupBinary } from './companionLanResponses.js';
import { isRetiredSyncJsonEndpoint } from './companionLanSyncObjects.js';
import { handleCompanionSyncPush, SYNC_PUSH_PATH } from './companionLanSyncPush.js';
import { authenticateCompanionRequest } from './companionRequestAuth.js';
import {
  acceptDesktopSyncGroupMemberState,
  SYNC_GROUP_MEMBER_STATE_PATH
} from './desktopSyncGroupMemberState.js';
import { notifyDesktopSyncGroupOverviewChanged } from './desktopSyncGroupOverviewNotifier.js';
import { handleReadwiseGroupSetup, READWISE_GROUP_SETUP_PATH } from './readwiseGroupSetup.js';
import { handleReadwiseOwnerStop, READWISE_OWNER_STOP_PATH } from './readwiseOwnerStop.js';
import { loadResourceAvailability } from './resourceAvailability.js';
import { decryptWorkgroupRequestBody } from './workgroupHttpCrypto.js';

type WriteJson = (
  request: http.IncomingMessage,
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
  methods?: string
) => void;

function resolveAuthenticatedPostRoute(parsedRequestUrl: URL) {
  if (parsedRequestUrl.pathname === READWISE_GROUP_SETUP_PATH) return 'readwise-group-setup';
  if (parsedRequestUrl.pathname === READWISE_OWNER_STOP_PATH) return 'readwise-owner-stop';
  if (parsedRequestUrl.pathname === RESOURCE_AVAILABILITY_PATH) return 'resource-availability';
  if (parsedRequestUrl.pathname === CONTENT_BLOB_ACK_PATH) return 'content-blob-ack';
  if (parsedRequestUrl.pathname === CONTENT_BLOB_BATCH_PATH) return 'content-blob-batch';
  if (parsedRequestUrl.pathname === SYNC_PUSH_PATH) return 'sync-push';
  if (parsedRequestUrl.pathname === SYNC_GROUP_MEMBER_STATE_PATH) return 'member-state';
  if (isRetiredSyncJsonEndpoint(parsedRequestUrl)) return 'retired-sync-json';
  return null;
}

async function readAuthenticatedPostBody(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  writeJson: WriteJson
) {
  try {
    return await readCompanionRequestBody(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_request_body';
    await runWithDatabaseConnectionOwner(() => writeJson(
      request, response, message === 'request_too_large' ? 413 : 400,
      { error: message }, 'POST, OPTIONS'
    ));
    return null;
  }
}

async function handleAuthenticatedRoute(args: {
  auth: Extract<ReturnType<typeof authenticateCompanionRequest>, { ok: true }>;
  bodyText: string;
  request: http.IncomingMessage;
  response: http.ServerResponse;
  route: NonNullable<ReturnType<typeof resolveAuthenticatedPostRoute>>;
  writeJson: WriteJson;
}) {
  const { auth, bodyText, request, response, route, writeJson } = args;
  if (route === 'readwise-group-setup') {
    await writeReadwiseGroupSetupResponse(args);
  } else if (route === 'readwise-owner-stop') {
    try {
      writeJson(request, response, 200, handleReadwiseOwnerStop(bodyText, auth.device_id), 'POST, OPTIONS');
    } catch (error) {
      writeJson(request, response, 409, {
        error: error instanceof Error ? error.message : 'readwise_stop_failed'
      }, 'POST, OPTIONS');
    }
  } else if (route === 'resource-availability') {
    try {
      writeJson(request, response, 200, await loadResourceAvailability(bodyText), 'POST, OPTIONS');
    } catch (error) {
      writeJson(request, response, 400, {
        error: error instanceof Error ? error.message : 'resource_availability_invalid_request'
      }, 'POST, OPTIONS');
    }
  } else if (route === 'content-blob-ack') {
    const ack = acknowledgeCompanionContentBlobs(bodyText);
    writeJson(request, response, ack.status === 'ok' ? 200 : ack.statusCode,
      ack.status === 'ok' ? ack : { error: ack.error }, 'POST, OPTIONS');
  } else if (route === 'content-blob-batch') {
    const batch = loadCompanionContentBlobBatch(bodyText);
    if (batch.status === 'ready') writeWorkgroupBinary(request, response, 200, batch.body, batch.mimeType);
    else writeJson(request, response, batch.statusCode, { error: batch.error }, 'POST, OPTIONS');
  } else if (route === 'sync-push') {
    try {
      writeJson(request, response, 200, await handleCompanionSyncPush(bodyText, auth.device_name), 'POST, OPTIONS');
    } catch (error) {
      writeJson(request, response, 400, {
        error: error instanceof Error ? error.message : 'invalid_sync_push_payload'
      }, 'POST, OPTIONS');
    }
  } else if (route === 'member-state') {
    try {
      const applied = acceptDesktopSyncGroupMemberState(bodyText, auth.device_id);
      writeJson(request, response, 200, applied.state, 'POST, OPTIONS');
      notifyDesktopSyncGroupOverviewChanged();
      if (applied.localExited) setImmediate(() => {
        void import('./lanWorkspaceSyncServer.js').then(({ stopLanWorkspaceSyncServer }) =>
          stopLanWorkspaceSyncServer());
      });
    } catch (error) {
      writeJson(request, response, 400, {
        error: error instanceof Error ? error.message : 'sync_group_member_state_invalid'
      }, 'POST, OPTIONS');
    }
  }
}

async function writeReadwiseGroupSetupResponse(args: {
  auth: Extract<ReturnType<typeof authenticateCompanionRequest>, { ok: true }>;
  bodyText: string;
  request: http.IncomingMessage;
  response: http.ServerResponse;
  writeJson: WriteJson;
}) {
  const { auth, bodyText, request, response, writeJson } = args;
  try {
    writeJson(request, response, 200, await handleReadwiseGroupSetup(bodyText, auth.device_id), 'POST, OPTIONS');
  } catch (error) {
    writeJson(request, response, 409, {
      error: error instanceof Error ? error.message : 'readwise_group_setup_failed'
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
  if (route === 'retired-sync-json') {
    await runWithDatabaseConnectionOwner(() => writeJson(
      request, response, 410, { error: 'sync_json_endpoint_retired' }, 'POST, OPTIONS'
    ));
    return true;
  }
  if (!route) {
    await runWithDatabaseConnectionOwner(() => writeJson(
      request, response, 404, { error: 'not_found' }, 'POST, OPTIONS'
    ));
    return true;
  }
  const bodyText = await readAuthenticatedPostBody(request, response, writeJson);
  if (bodyText === null) {
    return true;
  }
  await runWithDatabaseConnectionOwner(async () => {
    const auth = authenticateCompanionRequest({
      allowUnknownDevice: route === 'member-state', bodyText, request,
      requireMemberState: route !== 'member-state'
    });
    if (!auth.ok) {
      writeJson(request, response, auth.status_code, { error: auth.error });
      return;
    }
    let plaintext: string;
    try {
      plaintext = decryptWorkgroupRequestBody(request, bodyText).toString('utf8');
    } catch (error) {
      writeJson(request, response, 401, {
        error: error instanceof Error ? error.message : 'workgroup_aead_invalid'
      });
      return;
    }
    await handleAuthenticatedRoute({ auth, bodyText: plaintext, request, response, route, writeJson });
  });
  return true;
}
