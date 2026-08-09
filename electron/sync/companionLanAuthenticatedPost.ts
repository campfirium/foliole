import type http from 'node:http';

import {
  acknowledgeCompanionContentBlobs,
  CONTENT_BLOB_ACK_PATH,
  CONTENT_BLOB_BATCH_PATH,
  loadCompanionContentBlobBatch
} from './companionLanContentBlobs.js';
import { handlePrimaryDeviceTakeover, PRIMARY_DEVICE_TAKEOVER_PATH } from './companionLanPrimaryDeviceTakeover.js';
import { readCompanionRequestBody } from './companionLanRequestBody.js';
import { isRetiredSyncJsonEndpoint } from './companionLanSyncObjects.js';
import { handleCompanionSyncPush, SYNC_PUSH_PATH } from './companionLanSyncPush.js';
import { authenticateCompanionRequest } from './companionRequestAuth.js';

type WriteJson = (
  request: http.IncomingMessage,
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
  methods?: string
) => void;

function writeBinary(response: http.ServerResponse, statusCode: number, body: Buffer, mimeType: string) {
  response.writeHead(statusCode, {
    'Content-Length': body.byteLength,
    'Content-Type': mimeType
  });
  response.end(body);
}

function resolveAuthenticatedPostRoute(parsedRequestUrl: URL) {
  if (parsedRequestUrl.pathname === CONTENT_BLOB_ACK_PATH) return 'content-blob-ack';
  if (parsedRequestUrl.pathname === CONTENT_BLOB_BATCH_PATH) return 'content-blob-batch';
  if (parsedRequestUrl.pathname === SYNC_PUSH_PATH) return 'sync-push';
  if (parsedRequestUrl.pathname === PRIMARY_DEVICE_TAKEOVER_PATH) return 'primary-device-takeover';
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
    writeJson(request, response, message === 'request_too_large' ? 413 : 400, { error: message }, 'POST, OPTIONS');
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
  if (route === 'content-blob-ack') {
    const ack = acknowledgeCompanionContentBlobs(bodyText);
    writeJson(request, response, ack.status === 'ok' ? 200 : ack.statusCode,
      ack.status === 'ok' ? ack : { error: ack.error }, 'POST, OPTIONS');
  } else if (route === 'content-blob-batch') {
    const batch = loadCompanionContentBlobBatch(bodyText);
    if (batch.status === 'ready') writeBinary(response, 200, batch.body, batch.mimeType);
    else writeJson(request, response, batch.statusCode, { error: batch.error }, 'POST, OPTIONS');
  } else if (route === 'sync-push') {
    try {
      writeJson(request, response, 200, await handleCompanionSyncPush(bodyText, auth.device_id), 'POST, OPTIONS');
    } catch (error) {
      writeJson(request, response, 400, {
        error: error instanceof Error ? error.message : 'invalid_sync_push_payload'
      }, 'POST, OPTIONS');
    }
  } else if (route === 'primary-device-takeover') {
    const result = handlePrimaryDeviceTakeover(bodyText, auth.device_id);
    writeJson(request, response, result.statusCode, result.value, 'POST, OPTIONS');
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
    writeJson(request, response, 410, { error: 'sync_json_endpoint_retired' }, 'POST, OPTIONS');
    return true;
  }
  if (!route) {
    writeJson(request, response, 404, { error: 'not_found' }, 'POST, OPTIONS');
    return true;
  }
  const bodyText = await readAuthenticatedPostBody(request, response, writeJson);
  if (bodyText === null) {
    return true;
  }
  const auth = authenticateCompanionRequest({ bodyText, request });
  if (!auth.ok) {
    writeJson(request, response, auth.status_code, { error: auth.error });
    return true;
  }
  await handleAuthenticatedRoute({ auth, bodyText, request, response, route, writeJson });
  return true;
}
