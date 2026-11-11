import type { WebDavRelayBinding } from '../../platform/webDavRelayContract.js';

import type { DbPort } from './dbPort.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import { webDavRelayStatus, type WebDavRelayRequest } from './webDavRelayPublication.js';

export type WebDavAuthenticationStatus = 401 | 403;
export type WebDavAuthenticationPause = { key: string; manual?: boolean; changed?(): void };

export class WebDavAuthenticationError extends Error {
  constructor(readonly status: WebDavAuthenticationStatus, readonly deferred = false) {
    super(status === 401 ? 'webdav_relay_authentication_required' : 'webdav_relay_permission_denied');
  }
}

export function webDavAuthenticationKey(binding: WebDavRelayBinding, deviceId: string, libraryEpoch: string,
  credentialRevision: number | string | undefined = binding.credential_version) {
  if (credentialRevision === undefined) return undefined;
  return `webdav_relay_auth:${JSON.stringify([binding.group_id, binding.id, deviceId, libraryEpoch, credentialRevision])}`;
}

export async function readWebDavAuthenticationPause(db: DbPort, key: string | undefined): Promise<WebDavAuthenticationStatus | undefined> {
  if (!key) return undefined;
  const [row] = await db.query<{ value: string }>('SELECT value FROM sync_group_metadata WHERE key = ?', [key]);
  return row?.value === '401' ? 401 : row?.value === '403' ? 403 : undefined;
}

function detectAuthenticationFailure(request: WebDavRelayRequest, responded: () => void): WebDavRelayRequest {
  return (url, input, receive) => request(url, input, async (status, body) => {
    if (status === 401 || status === 403) {
      await webDavRelayStatus(status, body).catch(() => undefined);
      throw new WebDavAuthenticationError(status);
    }
    if (status >= 200 && status < 300) responded();
    return receive(status, body);
  });
}

export async function withWebDavAuthenticationPause<T>(host: RequestSyncDatabaseHost,
  pause: WebDavAuthenticationPause | undefined, request: WebDavRelayRequest, signal: AbortSignal | undefined,
  run: (request: WebDavRelayRequest) => Promise<T>): Promise<T> {
  if (!pause) return run(request);
  const previous = await host.readSnapshot(db => readWebDavAuthenticationPause(db, pause.key), signal);
  if (previous && !pause.manual) throw new WebDavAuthenticationError(previous, true);
  let responded = false;
  try {
    const result = await run(detectAuthenticationFailure(request, () => { responded = true; }));
    if (previous && responded) {
      await host.write(db => db.run('DELETE FROM sync_group_metadata WHERE key = ? AND value = ?', [pause.key, String(previous)]));
      pause.changed?.();
    }
    return result;
  } catch (error) {
    if (error instanceof WebDavAuthenticationError && !error.deferred) {
      await host.write(db => db.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, [pause.key, String(error.status), new Date().toISOString()]));
      pause.changed?.();
    }
    throw error;
  }
}
