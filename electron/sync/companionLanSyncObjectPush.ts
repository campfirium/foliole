import type http from 'node:http';

import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';
import { applySyncObjects } from '../database/syncObjectApply.js';

import { readCompanionRequestBody } from './companionLanRequestBody.js';
import { authenticateCompanionRequest } from './companionRequestAuth.js';

type JsonResponder = (
  request: http.IncomingMessage,
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown
) => void;

export async function handleSyncObjectsPush(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  writeJson: JsonResponder
) {
  let bodyText = '';
  try {
    bodyText = await readCompanionRequestBody(request);
  } catch {
    writeJson(request, response, 413, { error: 'request_too_large' });
    return;
  }
  const auth = authenticateCompanionRequest({ bodyText, request });
  if (!auth.ok) {
    writeJson(request, response, auth.status_code, { error: auth.error });
    return;
  }
  try {
    const payload = JSON.parse(bodyText) as { objects?: unknown };
    const objects = Array.isArray(payload.objects) ? payload.objects as NativeSyncObjectRecord[] : [];
    writeJson(request, response, 200, { applied_object_ids: applySyncObjects(objects) });
  } catch {
    writeJson(request, response, 400, { error: 'invalid_json' });
  }
}
