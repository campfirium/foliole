import { upsertReadwiseSourceWithSyncState } from '../../lib/core/database/readwiseSources.js';
import {
  fetchReadwiseTokenSyncBatch,
  normalizeReadwiseTokenSyncBatch,
  ReadwiseSyncHttpError,
  type ReadwiseTokenSyncResult
} from '../../lib/core/readwise/readwiseTokenSync.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopDeviceId } from '../database/deviceIdentity.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';
import { canDesktopRunExternalSources } from '../sync/primaryDeviceState.js';

import { loadReadwiseTokenSecretForCredentialBag } from './readwiseTokenConnector.js';

const READWISE_TOKEN_SYNC_STATE_KEY = 'readwise_token_sync_state';

interface ReadwiseTokenSyncState {
  updatedAfter: string | null;
}

function now() {
  return new Date().toISOString();
}

function result(status: ReadwiseTokenSyncResult['status'], message: string, counts = { documentCount: 0, sourceCount: 0 }) {
  return {
    checked_at: now(),
    document_count: counts.documentCount,
    message,
    source_count: counts.sourceCount,
    status
  } satisfies ReadwiseTokenSyncResult;
}

function loadState(): ReadwiseTokenSyncState {
  const value = loadJsonSetting(READWISE_TOKEN_SYNC_STATE_KEY);
  return value && typeof value === 'object' && typeof (value as ReadwiseTokenSyncState).updatedAfter === 'string'
    ? { updatedAfter: (value as ReadwiseTokenSyncState).updatedAfter }
    : { updatedAfter: null };
}

export async function syncReadwiseTokenLibrary(): Promise<ReadwiseTokenSyncResult> {
  if (!canDesktopRunExternalSources()) {
    return result('blocked_secondary', 'Readwise sync runs on the current primary device.');
  }
  const token = loadReadwiseTokenSecretForCredentialBag();
  if (!token) {
    return result('not_connected', 'Connect Readwise before syncing.');
  }
  try {
    const startedAt = now();
    const batch = await fetchReadwiseTokenSyncBatch({ token, updatedAfter: loadState().updatedAfter });
    const normalized = normalizeReadwiseTokenSyncBatch(batch);
    const driver = openDatabaseConnection().driver;
    const deviceId = loadOrCreateDesktopDeviceId(startedAt);
    for (const source of normalized.sources) {
      upsertReadwiseSourceWithSyncState(driver, source, deviceId);
    }
    saveJsonSetting(READWISE_TOKEN_SYNC_STATE_KEY, { updatedAfter: startedAt }, startedAt);
    return result('synced', syncMessage(normalized.sources.length, batch.documents.length), {
      documentCount: batch.documents.length,
      sourceCount: normalized.sources.length
    });
  } catch (error) {
    if (error instanceof ReadwiseSyncHttpError) {
      return result(error.status, errorMessage(error.status));
    }
    return result('failed', 'Could not sync Readwise library.');
  }
}

function syncMessage(sourceCount: number, documentCount: number) {
  if (sourceCount === 0) return 'Readwise sync finished; no library documents changed.';
  return `Readwise sync finished; updated ${sourceCount} of ${documentCount} library documents.`;
}

function errorMessage(status: ReadwiseTokenSyncResult['status']) {
  if (status === 'invalid_token') return 'Readwise rejected this token. Reconnect with a current token.';
  if (status === 'rate_limited') return 'Readwise is rate limiting requests. Try again later.';
  return 'Readwise sync failed.';
}
