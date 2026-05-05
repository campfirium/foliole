import type http from 'node:http';

import type {
  NativeSyncNodeRecord,
  NativeSyncObjectRecord,
  NativeSyncReviewLogRecord
} from '../../lib/platform/nativeSyncContract.js';
import { applySyncNodes } from '../database/syncApply.js';
import { applySyncObjects } from '../database/syncObjectApply.js';
import { applySyncReviewLog } from '../database/syncReviewLog.js';

import { readCompanionRequestBody } from './companionLanRequestBody.js';
import { authenticateCompanionRequest } from './companionRequestAuth.js';
import { notifyWorkspaceSyncApplied } from './workspaceSyncAppliedEvents.js';

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
    const appliedObjectIds = applySyncObjects(objects, { includeAlreadyApplied: true });
    notifyWorkspaceSyncApplied({ appliedNodeIds: [], appliedObjectIds, appliedReviewOpIds: [] });
    writeJson(request, response, 200, { applied_object_ids: appliedObjectIds });
  } catch {
    writeJson(request, response, 400, { error: 'invalid_json' });
  }
}

export async function handleSyncNodeVersionsPush(
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
    const payload = JSON.parse(bodyText) as { nodes?: unknown };
    const nodes = Array.isArray(payload.nodes) ? payload.nodes as NativeSyncNodeRecord[] : [];
    const appliedNodeIds = applySyncNodes(nodes, { includeAlreadyApplied: true });
    notifyWorkspaceSyncApplied({ appliedNodeIds, appliedObjectIds: [], appliedReviewOpIds: [] });
    writeJson(request, response, 200, { applied_node_ids: appliedNodeIds });
  } catch {
    writeJson(request, response, 400, { error: 'invalid_json' });
  }
}

export async function handleSyncReviewLogPush(
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
    const payload = JSON.parse(bodyText) as { reviews?: unknown };
    const reviews = Array.isArray(payload.reviews) ? payload.reviews as NativeSyncReviewLogRecord[] : [];
    const appliedReviewOpIds = applySyncReviewLog(reviews, { includeAlreadyApplied: true });
    notifyWorkspaceSyncApplied({ appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds });
    writeJson(request, response, 200, { applied_op_ids: appliedReviewOpIds });
  } catch {
    writeJson(request, response, 400, { error: 'invalid_json' });
  }
}
