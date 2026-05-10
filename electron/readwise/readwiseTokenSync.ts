import {
  backfillReadwiseDocumentSources,
  countReadwiseDocumentSources
} from '../../lib/core/database/readwiseDocumentSources.js';
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

import { readwiseHttpsFetch } from './readwiseHttpsFetch.js';
import { loadReadwiseTokenSecretForCredentialBag } from './readwiseTokenConnector.js';

const READWISE_TOKEN_SYNC_STATE_KEY = 'readwise_token_sync_state';
const READWISE_SYNC_PAGE_LIMIT = 5;
const READWISE_LIBRARY_LOCATIONS = ['new', 'later', 'shortlist', 'archive'] as const;

interface ReadwiseTokenSyncState {
  pendingLocationIndex: number;
  pendingPageCursor: string | null;
  syncStartedAt: string | null;
  updatedAfter: string | null;
}

function now() {
  return new Date().toISOString();
}

function result(
  status: ReadwiseTokenSyncResult['status'],
  message: string,
  counts = { documentCount: 0, hasMore: false, pageCount: 0, retryAfterSeconds: null as number | null, sourceCount: 0 }
) {
  return {
    checked_at: now(),
    document_count: counts.documentCount,
    has_more: counts.hasMore,
    message,
    page_count: counts.pageCount,
    retry_after_seconds: counts.retryAfterSeconds,
    source_count: counts.sourceCount,
    status
  } satisfies ReadwiseTokenSyncResult;
}

function loadState(): ReadwiseTokenSyncState {
  const value = loadJsonSetting(READWISE_TOKEN_SYNC_STATE_KEY);
  if (!value || typeof value !== 'object') return emptyState();
  const candidate = value as Partial<ReadwiseTokenSyncState>;
  return {
    pendingLocationIndex: typeof candidate.pendingLocationIndex === 'number' ? candidate.pendingLocationIndex : 0,
    pendingPageCursor: typeof candidate.pendingPageCursor === 'string' ? candidate.pendingPageCursor : null,
    syncStartedAt: typeof candidate.syncStartedAt === 'string' ? candidate.syncStartedAt : null,
    updatedAfter: typeof candidate.updatedAfter === 'string' ? candidate.updatedAfter : null
  };
}

function emptyState(): ReadwiseTokenSyncState {
  return { pendingLocationIndex: 0, pendingPageCursor: null, syncStartedAt: null, updatedAfter: null };
}

function resetStaleInitialCursor(state: ReadwiseTokenSyncState, hasDocumentSources: boolean): ReadwiseTokenSyncState {
  if (hasDocumentSources || !state.updatedAfter || state.pendingPageCursor) return state;
  return { ...state, pendingLocationIndex: 0, pendingPageCursor: null, syncStartedAt: null, updatedAfter: null };
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
    const state = loadState();
    const startedAt = state.syncStartedAt ?? now();
    const driver = openDatabaseConnection().driver;
    const deviceId = loadOrCreateDesktopDeviceId(startedAt);
    const recoveredSourceCount = backfillReadwiseDocumentSources(driver, deviceId);
    const effectiveState = resetStaleInitialCursor(state, countReadwiseDocumentSources(driver) > 0);
    const summary = await syncPages({ deviceId, driver, startedAt, state: effectiveState, token });
    summary.recoveredSourceCount = recoveredSourceCount;
    summary.sourceCount += recoveredSourceCount;
    return result(summary.nextCursor ? 'partial' : 'synced', syncMessage(summary), summary);
  } catch (error) {
    if (error instanceof ReadwiseSyncHttpError) {
      return result(error.status, errorMessage(error), {
        documentCount: 0,
        hasMore: Boolean(loadState().pendingPageCursor),
        pageCount: 0,
        retryAfterSeconds: error.retryAfterSeconds,
        sourceCount: 0
      });
    }
    return result('failed', 'Could not sync Readwise library.');
  }
}

async function syncPages(input: {
  deviceId: string;
  driver: ReturnType<typeof openDatabaseConnection>['driver'];
  startedAt: string;
  state: ReadwiseTokenSyncState;
  token: string;
}) {
  let cursor = input.state.pendingPageCursor;
  let locationIndex = input.state.pendingLocationIndex;
  let exportBooks: unknown[] | null = null;
  let documentCount = 0;
  let pageCount = 0;
  let sourceCount = 0;
  for (let page = 0; page < READWISE_SYNC_PAGE_LIMIT; page += 1) {
    const location = READWISE_LIBRARY_LOCATIONS[locationIndex];
    if (!location) break;
    const batch = await fetchReadwiseTokenSyncBatch({
      fetchImpl: readwiseHttpsFetch,
      includeExport: exportBooks === null,
      location,
      pageCursor: cursor,
      token: input.token,
      updatedAfter: input.state.updatedAfter
    });
    exportBooks ??= batch.exportBooks;
    const normalized = normalizeReadwiseTokenSyncBatch({ ...batch, exportBooks });
    for (const source of normalized.sources) {
      upsertReadwiseSourceWithSyncState(input.driver, source, input.deviceId);
    }
    documentCount += batch.documents.length;
    pageCount += 1;
    sourceCount += normalized.sources.length;
    cursor = normalized.nextCursor;
    if (!cursor) locationIndex += 1;
    const hasMore = locationIndex < READWISE_LIBRARY_LOCATIONS.length;
    saveJsonSetting(READWISE_TOKEN_SYNC_STATE_KEY, {
      pendingLocationIndex: hasMore ? locationIndex : 0,
      pendingPageCursor: cursor,
      syncStartedAt: hasMore ? input.startedAt : null,
      updatedAfter: hasMore ? input.state.updatedAfter : input.startedAt
    }, input.startedAt);
    if (!hasMore) break;
  }
  return {
    documentCount,
    hasMore: locationIndex < READWISE_LIBRARY_LOCATIONS.length,
    nextCursor: locationIndex < READWISE_LIBRARY_LOCATIONS.length ? (cursor ?? READWISE_LIBRARY_LOCATIONS[locationIndex] ?? null) : null,
    pageCount,
    recoveredSourceCount: 0,
    retryAfterSeconds: null,
    sourceCount
  };
}

function syncMessage(summary: { documentCount: number; nextCursor: string | null; recoveredSourceCount: number; sourceCount: number }) {
  if (summary.nextCursor) return `Readwise sync paused; updated ${summary.sourceCount} library documents so far.`;
  if (summary.recoveredSourceCount > 0 && summary.documentCount === 0) {
    return `Readwise sync finished; recovered ${summary.recoveredSourceCount} library documents.`;
  }
  if (summary.sourceCount === 0) return 'Readwise sync finished; no library documents changed.';
  return `Readwise sync finished; updated ${summary.sourceCount} of ${summary.documentCount} library documents.`;
}

function errorMessage(error: ReadwiseSyncHttpError) {
  if (error.status === 'invalid_token') return 'Readwise rejected this token. Reconnect with a current token.';
  if (error.status === 'rate_limited') {
    return error.retryAfterSeconds === null
      ? 'Readwise is rate limiting requests. Sync can continue later.'
      : `Readwise is rate limiting requests. Sync can continue in ${error.retryAfterSeconds} seconds.`;
  }
  return 'Readwise sync failed.';
}
