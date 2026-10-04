import type http from 'node:http';

import { assertSyncGroupJoinMergeAllowed } from '../../lib/core/sync/syncGroupJoinMergeGuard.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import { readCompanionRequestBody } from './companionLanRequestBody.js';
import { loadDesktopSyncGroupJoinProvider } from './desktopSyncGroupJoinProvider.js';
import { MAX_SYNC_GROUP_JOIN_REQUEST_BYTES } from './syncGroupJoinProvider.js';

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
    const input: unknown = JSON.parse(await readCompanionRequestBody(request, MAX_SYNC_GROUP_JOIN_REQUEST_BYTES));
    const created = await runWithDatabaseConnectionOwner(async () => {
      await assertSyncGroupJoinMergeAllowed(createBetterSqliteDbPort(openDatabaseConnection().sqlite), input);
      return provider.receive(input as Parameters<typeof provider.receive>[0]);
    });
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
  try {
    const payload = JSON.parse(await readCompanionRequestBody(request)) as Record<string, unknown>;
    const result = await runWithDatabaseConnectionOwner(() => {
      const provider = loadDesktopSyncGroupJoinProvider();
      return provider
        ? { acceptance: provider.collect(String(payload.request_id ?? '')), available: true as const }
        : { acceptance: null, available: false as const };
    });
    if (!result.available) {
      return writeJson(request, response, 409, { error: 'sync_group_not_available' });
    }
    const { acceptance } = result;
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
  const status = message === 'sync_group_join_capacity_exceeded' ? 429
    : message === 'request_too_large' ? 413
    : message.includes('identity_mismatch') || message.includes('incompatible') ? 409 : 400;
  writeJson(request, response, status, { error: message });
}
