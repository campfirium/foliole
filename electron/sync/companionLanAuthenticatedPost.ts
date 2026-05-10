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

export async function handleAuthenticatedPost(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  parsedRequestUrl: URL,
  writeJson: WriteJson
) {
  const bodyText = await readCompanionRequestBody(request);
  const auth = authenticateCompanionRequest({ bodyText, request });
  if (!auth.ok) {
    writeJson(request, response, auth.status_code, { error: auth.error });
    return true;
  }
  if (parsedRequestUrl.pathname === CONTENT_BLOB_ACK_PATH) {
    const ack = acknowledgeCompanionContentBlobs(bodyText);
    writeJson(request, response, ack.status === 'ok' ? 200 : ack.statusCode, ack.status === 'ok' ? ack : {
      error: ack.error
    }, 'POST, OPTIONS');
    return true;
  }
  if (parsedRequestUrl.pathname === CONTENT_BLOB_BATCH_PATH) {
    const batch = loadCompanionContentBlobBatch(bodyText);
    if (batch.status === 'ready') {
      writeBinary(response, 200, batch.body, batch.mimeType);
    } else {
      writeJson(request, response, batch.statusCode, { error: batch.error }, 'POST, OPTIONS');
    }
    return true;
  }
  if (parsedRequestUrl.pathname === SYNC_PUSH_PATH) {
    try {
      writeJson(request, response, 200, await handleCompanionSyncPush(bodyText), 'POST, OPTIONS');
    } catch (error) {
      writeJson(request, response, 400, {
        error: error instanceof Error ? error.message : 'invalid_sync_push_payload'
      }, 'POST, OPTIONS');
    }
    return true;
  }
  if (parsedRequestUrl.pathname === PRIMARY_DEVICE_TAKEOVER_PATH) {
    const result = handlePrimaryDeviceTakeover(bodyText, auth.device_id);
    writeJson(request, response, result.statusCode, result.value, 'POST, OPTIONS');
    return true;
  }
  if (isRetiredSyncJsonEndpoint(parsedRequestUrl)) {
    writeJson(request, response, 410, { error: 'sync_json_endpoint_retired' }, 'POST, OPTIONS');
    return true;
  }
  writeJson(request, response, 404, { error: 'not_found' }, 'POST, OPTIONS');
  return true;
}
