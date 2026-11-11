import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import { WebDavServiceBusyError } from './webDavRetryAfter.js';

export async function runWithWebDavRetryAfter<T>(host: RequestSyncDatabaseHost, scopeKey: string,
  signal: AbortSignal | undefined, run: () => Promise<T>) {
  const key = `${scopeKey}:retry-after`;
  const [saved] = await host.readSnapshot(db => db.query<{ value: string }>(
    'SELECT value FROM sync_group_metadata WHERE key = ?', [key]), signal);
  if (saved) {
    const [status, retryAt] = saved.value.split(':').map(Number);
    if ((status === 429 || status === 503) && retryAt !== undefined && Number.isSafeInteger(retryAt) && retryAt > Date.now()) {
      throw new WebDavServiceBusyError(status, retryAt, undefined, true);
    }
  }
  try {
    return await run();
  } catch (error) {
    if (error instanceof WebDavServiceBusyError && error.retryAt !== undefined && error.retryAt > Date.now()) {
      await host.write(db => db.run(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, `${error.status}:${error.retryAt}`, new Date().toISOString()]));
    }
    throw error;
  }
}
