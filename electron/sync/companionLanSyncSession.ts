import type http from 'node:http';

import { SYNC_SESSION_PATH, syncSessionRequestSchema } from '../../lib/platform/syncSessionContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { writeJson } from './companionLanResponses.js';
import { authenticateCompanionRequestContext, revalidateCompanionRequestAuthorization } from './companionRequestAuth.js';
import { desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';

export async function handleCompanionSyncSession(request: http.IncomingMessage, response: http.ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname !== SYNC_SESSION_PATH) return false;
  const controller = new AbortController();
  const disconnected = () => controller.abort(new Error('sync_session_disconnected'));
  response.once('close', disconnected);
  try {
    const context = await runWithDatabaseConnectionOwner(() => authenticateCompanionRequestContext({
      request, requireMemberState: true
    }));
    if (!('auth' in context)) {
      await runWithDatabaseConnectionOwner(() => writeJson(request, response, context.status_code, { error: context.error }));
      return true;
    }
    const input = syncSessionRequestSchema.parse(JSON.parse(url.searchParams.get('input') ?? 'null'));
    if (request.method !== (input.operation === 'wait' ? 'GET' : 'POST')) {
      writeJson(request, response, 405, { error: 'method_not_allowed' });
      return true;
    }
    const sessions = desktopSyncChangeSessions();
    const peer = context.auth.device_id;
    const reply = input.operation === 'open' ? sessions.open(peer)
      : input.operation === 'close' ? (sessions.close(peer, input.session), { closed: true })
        : input.operation === 'complete' ? { completed: true }
        : await sessions.wait(peer, input.session, input.marker, controller.signal);
    await runWithDatabaseConnectionOwner(() => {
      if (response.destroyed) return;
      const auth = revalidateCompanionRequestAuthorization(context);
      if (!auth.ok) {
        if ('session' in reply) sessions.close(peer, reply.session);
        writeJson(request, response, auth.status_code, { error: auth.error });
      } else {
        if (input.operation === 'complete') sessions.complete(peer, input.session, input.marker);
        writeJson(request, response, 200, reply);
      }
    });
  } catch (error) {
    if (!response.destroyed && !response.writableEnded) await runWithDatabaseConnectionOwner(() => {
      writeJson(request, response, 409, { error: error instanceof Error ? error.message : 'sync_session_invalid' });
    });
  } finally { response.off('close', disconnected); }
  return true;
}
