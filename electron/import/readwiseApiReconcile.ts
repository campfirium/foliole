import {
  ALL_READWISE_RECONCILE_SCOPE,
  normalizeReadwiseReconcileExportBook,
  normalizeReadwiseReconcileReaderDocument,
  type ReadwiseReconcileScope
} from '../../lib/core/readwise/readwiseRemoteLifecycle.js';
import type { NativeReadwiseReconcileResult } from '../../lib/platform/nativeReadwiseApiImportContract.js';
import {
  completeReadwiseApiReconcileRun,
  loadOrCreateReadwiseApiReconcileRun,
  saveReadwiseApiReconcilePage,
  type ReadwiseApiReconcileRunState
} from '../database/readwiseApiReconcileState.js';
import { canCurrentHostRunReadwise } from '../database/readwiseHostAssignment.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import {
  createReadwiseApiRequest,
  READWISE_EXPORT_URL,
  READWISE_READER_LIST_URL,
  type ReadwiseApiFetchDependencies
} from './readwiseApiImportFetch.js';

interface ActiveReconcile {
  controller: AbortController;
  promise: Promise<NativeReadwiseReconcileResult>;
}

let activeReconcile: ActiveReconcile | null = null;

export function runReadwiseApiReconcile(input?: {
  dependencies?: ReadwiseApiFetchDependencies;
  scope?: ReadwiseReconcileScope;
}): Promise<NativeReadwiseReconcileResult> {
  if (activeReconcile) return activeReconcile.promise;
  const controller = new AbortController();
  const promise = runNow(input, controller.signal).finally(() => {
    if (activeReconcile?.controller === controller) activeReconcile = null;
  });
  activeReconcile = { controller, promise };
  return promise;
}

export function cancelReadwiseApiReconcile() {
  if (!activeReconcile) return { status: 'idle' as const };
  activeReconcile.controller.abort();
  return { status: 'cancelled' as const };
}

async function runNow(
  input: Parameters<typeof runReadwiseApiReconcile>[0],
  signal: AbortSignal
): Promise<NativeReadwiseReconcileResult> {
  const connectionRef = requireConnectionRef();
  const scope = input?.scope ?? ALL_READWISE_RECONCILE_SCOPE;
  const dependencies = { ...input?.dependencies, signal };
  const request = createReadwiseApiRequest(dependencies);
  let run = loadOrCreateReadwiseApiReconcileRun(connectionRef, scope);
  try {
    while (run.phase !== 'ready') {
      assertEligible(signal);
      run = await fetchPage(run, request);
    }
    assertEligible(signal);
    const result = completeReadwiseApiReconcileRun(run);
    return {
      export_deleted_count: result.exportDeletedCount,
      present_count: result.presentCount,
      reader_missing_count: result.readerMissingCount,
      reconciled_at: result.reconciledAt,
      status: 'completed',
      unconfirmed_count: result.unconfirmedCount
    };
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return incompleteResult('cancelled');
    }
    return incompleteResult('failed');
  }
}

async function fetchPage(
  run: ReadwiseApiReconcileRunState,
  request: (url: URL) => Promise<Record<string, unknown>>
) {
  const kind = run.phase === 'export' ? 'export' : 'reader';
  const url = new URL(kind === 'reader' ? READWISE_READER_LIST_URL : READWISE_EXPORT_URL);
  if (kind === 'reader') {
    url.searchParams.set('limit', '100');
    if (run.scope.readerLocation !== 'all') url.searchParams.set('location', run.scope.readerLocation);
    if (run.readerCursor) url.searchParams.set('pageCursor', run.readerCursor);
  } else {
    url.searchParams.set('includeDeleted', 'true');
    if (run.exportCursor) url.searchParams.set('pageCursor', run.exportCursor);
  }
  const payload = await request(url);
  const values = Array.isArray(payload.results) ? payload.results : [];
  const items = kind === 'reader'
    ? values.map(normalizeReadwiseReconcileReaderDocument).filter((item) => item !== null)
    : values.map(normalizeReadwiseReconcileExportBook).filter((item) => item !== null);
  const cursor = typeof payload.nextPageCursor === 'string' && payload.nextPageCursor
    ? payload.nextPageCursor : null;
  saveReadwiseApiReconcilePage({ connectionRef: run.connectionRef, cursor, items, kind });
  return loadOrCreateReadwiseApiReconcileRun(run.connectionRef, run.scope);
}

function requireConnectionRef() {
  if (!canCurrentHostRunReadwise('api')) throw new Error('readwise_api_reconcile_not_ready');
  const source = loadReadwiseRemoteSource();
  if (!source) throw new Error('readwise_api_source_missing');
  return source.connectionRef;
}

function assertEligible(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Readwise reconcile cancelled', 'AbortError');
  if (!canCurrentHostRunReadwise('api')) throw new Error('readwise_execution_eligibility_lost');
}

function incompleteResult(status: 'cancelled' | 'failed'): NativeReadwiseReconcileResult {
  return {
    export_deleted_count: 0,
    present_count: 0,
    reader_missing_count: 0,
    reconciled_at: null,
    status,
    unconfirmed_count: 0
  };
}
