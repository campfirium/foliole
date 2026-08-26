import type http from 'node:http';

import { readCompanionRequestBody } from './companionLanRequestBody.js';
import { loadDesktopSyncGroupJoinProvider } from './desktopSyncGroupJoinProvider.js';

type JsonResponder = (
  request: http.IncomingMessage,
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown
) => void;

export async function handleSyncGroupJoinRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  onRequestCreated: (() => void) | null,
  writeJson: JsonResponder
) {
  const provider = loadDesktopSyncGroupJoinProvider();
  if (!provider) return writeJson(request, response, 409, { error: 'sync_group_not_available' });
  try {
    const created = provider.receive(JSON.parse(await readCompanionRequestBody(request)));
    writeJson(request, response, 202, created);
    onRequestCreated?.();
  } catch (error) {
    writeJoinError(request, response, error, writeJson);
  }
}

export async function handleSyncGroupJoinAcceptance(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  writeJson: JsonResponder
) {
  const provider = loadDesktopSyncGroupJoinProvider();
  if (!provider) return writeJson(request, response, 409, { error: 'sync_group_not_available' });
  try {
    const payload = JSON.parse(await readCompanionRequestBody(request)) as Record<string, unknown>;
    const acceptance = provider.collect(String(payload.request_id ?? ''));
    writeJson(request, response, acceptance ? 200 : 409,
      acceptance ?? { error: 'sync_group_join_not_accepted' });
  } catch (error) {
    writeJoinError(request, response, error, writeJson);
  }
}

function writeJoinError(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  error: unknown,
  writeJson: JsonResponder
) {
  const message = error instanceof Error ? error.message : 'sync_group_join_request_invalid';
  const status = message === 'request_too_large' ? 413
    : message.includes('identity_mismatch') || message.includes('incompatible') ? 409 : 400;
  writeJson(request, response, status, { error: message });
}
