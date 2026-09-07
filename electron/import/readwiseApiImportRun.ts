import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { normalizeImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { resolveReadwiseImportDestination } from '../../lib/core/import/readwiseReaderSettings.js';
import { prepareReadwiseApiDocuments, type PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import type {
  NativeReadwiseImportRunResult,
  NativeReadwiseSyncPreviewEntry,
  NativeReadwiseSyncPreviewResult
} from '../../lib/platform/nativeImportContract.js';
import {
  hasActiveReadwiseApiExternalDocument,
  hasReadwiseApiExternalDocumentChanged,
  loadReadwiseApiExternalDocumentState
} from '../database/readwiseApiExternalDocuments.js';
import {
  completeReadwiseApiImportRun,
  loadOrCreateReadwiseApiImportRun,
  loadReadwiseApiImportSource,
  loadStagedReadwiseApiContracts,
  loadVerifiedReadwiseHighlightIds
} from '../database/readwiseApiImportState.js';
import { canCurrentHostRunReadwise } from '../database/readwiseHostAssignment.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL } from '../ipc/contracts.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { commitReadwiseApiDocument } from './readwiseApiDocumentCommit.js';
import { fetchReadwiseApiImportRound, type ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';
import { createCancelledReadwiseApiImportResult } from './readwiseApiImportResults.js';
import type { ReadwiseImportProgressWindow } from './readwiseReaderRunAccumulator.js';


const MAX_PARENT_BATCH = 50;

interface ActiveApiImport {
  controller: AbortController;
  promise: Promise<NativeReadwiseImportRunResult>;
}

let activeApiImport: ActiveApiImport | null = null;

export async function previewReadwiseApiImport(
  settingsInput?: unknown,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  const settings = settingsInput ? normalizeImportManagerSettings(settingsInput) : loadImportManagerSettings();
  const connectionRef = requireConnectionRef();
  await fetchReadwiseApiImportRound(connectionRef, dependencies);
  return buildApiPreview(settings, connectionRef);
}

export function runReadwiseApiImport(input?: {
  dependencies?: ReadwiseApiFetchDependencies;
  settings?: unknown;
  window?: ReadwiseImportProgressWindow | null;
}): Promise<NativeReadwiseImportRunResult> {
  if (activeApiImport) return activeApiImport.promise;
  const controller = new AbortController();
  const promise = runNow(input, controller.signal).finally(() => {
    if (activeApiImport?.controller === controller) activeApiImport = null;
  });
  activeApiImport = { controller, promise };
  return promise;
}

export function cancelReadwiseApiImport() {
  if (!activeApiImport) return { status: 'idle' as const };
  activeApiImport.controller.abort();
  return { status: 'cancelled' as const };
}

async function runNow(
  input: Parameters<typeof runReadwiseApiImport>[0],
  signal: AbortSignal
): Promise<NativeReadwiseImportRunResult> {
  const settings = input?.settings ? normalizeImportManagerSettings(input.settings) : loadImportManagerSettings();
  const connectionRef = requireConnectionRef();
  try {
    await fetchReadwiseApiImportRound(connectionRef, {
      ...input?.dependencies,
      signal,
      onPage: (page) => publishProgress(input?.window, 0, 0, 'fetching', page.recordCount)
    });
    const preview = buildApiPreview(settings, connectionRef);
    const staged = prepareStagedDocuments(connectionRef);
    const writableIds = new Set(preview.entries
      .filter((entry) => entry.status === 'new' || entry.status === 'updated')
      .slice(0, MAX_PARENT_BATCH)
      .map((entry) => entry.remote_document_id));
    const offExternalIds = new Set(preview.entries.flatMap((entry) => {
      const remoteId = entry.remote_document_id;
      return typeof remoteId === 'string'
        && entry.destination === 'off'
        && hasActiveReadwiseApiExternalDocument(connectionRef, remoteId) ? [remoteId] : [];
    }));
    const documents = staged.filter((document) => writableIds.has(document.id) || offExternalIds.has(document.id));
    let annotationCount = 0;
    for (const [index, document] of documents.entries()) {
      assertEligible(signal);
      const result = await commitReadwiseApiDocument({
        config: settings.readwiseReaderConfig, connectionRef, dependencies: { ...input?.dependencies, signal }, document
      });
      annotationCount += result.annotationCount;
      publishProgress(input?.window, index + 1, documents.length, 'writing');
    }
    const remainingPreview = buildApiPreview(settings, connectionRef);
    const remainingCount = remainingPreview.write_count;
    if (remainingCount === 0) completeReadwiseApiImportRun(loadOrCreateReadwiseApiImportRun(connectionRef));
    publishProgress(input?.window, documents.length, documents.length, 'source_completed');
    return {
      annotation_count: annotationCount,
      committed_count: documents.length,
      completed_at: new Date().toISOString(),
      entry_count: documents.length,
      failed_count: remainingPreview.failed_count,
      imported_count: documents.length,
      remaining_count: remainingCount,
      source_count: remainingPreview.total_count,
      skipped_count: remainingPreview.off_count,
      status: remainingCount > 0 ? 'paused' : remainingPreview.failed_count > 0 ? 'failed' : 'completed'
    };
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return createCancelledReadwiseApiImportResult();
    }
    throw error;
  }
}

function buildApiPreview(settings: ImportManagerSettings, connectionRef: string): NativeReadwiseSyncPreviewResult {
  const documents = prepareStagedDocuments(connectionRef);
  const allEntries = documents.map((document) => buildEntry(settings, connectionRef, document));
  const entries = allEntries.slice(0, 200);
  const writeCount = allEntries.filter(isWritable).length;
  return {
    active_count: allEntries.filter((entry) => entry.status === 'unchanged').length,
    batch_count: Math.min(MAX_PARENT_BATCH, writeCount),
    blocked_count: allEntries.filter((entry) => entry.status === 'blocked_deleted').length,
    degraded_count: allEntries.filter((entry) => entry.status === 'failed').length,
    entries,
    estimated_seconds: Math.ceil(documents.length * 0.08),
    external_count: allEntries.filter((entry) => entry.destination === 'external').length,
    failed_count: allEntries.filter((entry) => entry.status === 'failed').length,
    inbox_count: allEntries.filter((entry) => entry.destination === 'inbox').length,
    mode: 'api',
    off_count: allEntries.filter((entry) => entry.destination === 'off').length,
    previewed_at: new Date().toISOString(),
    readwise_root_path: '',
    remaining_count: writeCount,
    removed_count: 0,
    total_count: allEntries.length,
    trash_count: 0,
    unmatched_annotation_count: documents.reduce((total, document) => total + document.unmatchedAnnotationCount, 0),
    with_highlights_count: allEntries.filter((entry) => entry.highlight_type === 'with_highlights').length,
    without_highlights_count: allEntries.filter((entry) => entry.highlight_type === 'without_highlights').length,
    write_count: writeCount
  };
}

function buildEntry(
  settings: ImportManagerSettings,
  connectionRef: string,
  document: PreparedReadwiseApiDocument
): NativeReadwiseSyncPreviewEntry {
  const existing = loadReadwiseApiImportSource(connectionRef, document.id);
  const configuredDestination = resolveReadwiseImportDestination(
    settings.readwiseReaderConfig, document.annotations.length > 0
  );
  const destination = existing ? 'inbox' : configuredDestination;
  const external = loadReadwiseApiExternalDocumentState(connectionRef, document.id);
  const externalChanged = hasReadwiseApiExternalDocumentChanged(connectionRef, document);
  const knownIds = new Set(existing?.annotations.map((annotation) => annotation.remoteId) ?? []);
  const hasNewAnnotations = document.annotations.some((annotation) => !knownIds.has(annotation.remoteId));
  const canResolveOriginalFile = destination === 'inbox'
    && (document.category === 'pdf' || document.category === 'epub');
  const hasImportableContent = Boolean(document.body.trim()) || canResolveOriginalFile;
  const status = destination === 'off' ? 'off'
    : existing?.nodeDeleted ? 'blocked_deleted'
    : !hasImportableContent ? 'failed'
    : destination === 'external' && (!external || external.is_present === 0) ? 'new'
    : destination === 'external' && externalChanged ? 'updated'
    : destination === 'external' ? 'unchanged'
    : !existing ? 'new'
    : hasNewAnnotations || existing.state.sourceUpdatedAt !== document.updatedAt ? 'updated'
    : 'unchanged';
  return {
    destination,
    detail: !hasImportableContent ? document.degradedReason : null,
    detected_highlight_count: document.annotations.length,
    highlight_type: document.annotations.length ? 'with_highlights' : 'without_highlights',
    remote_document_id: document.id,
    source_kind: document.category,
    source_path: document.title,
    status
  };
}

function prepareStagedDocuments(connectionRef: string) {
  const staged = loadStagedReadwiseApiContracts(connectionRef);
  return prepareReadwiseApiDocuments(
    staged.readerDocuments,
    staged.exportBooks,
    loadVerifiedReadwiseHighlightIds(connectionRef)
  );
}

function isWritable(entry: NativeReadwiseSyncPreviewEntry) {
  return entry.destination !== 'off' && (entry.status === 'new' || entry.status === 'updated');
}

function requireConnectionRef() {
  if (!canCurrentHostRunReadwise('api')) throw new Error('readwise_api_import_not_ready');
  const source = loadReadwiseRemoteSource();
  if (!source) throw new Error('readwise_api_source_missing');
  return source.connectionRef;
}

function assertEligible(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Readwise import cancelled', 'AbortError');
  if (!canCurrentHostRunReadwise('api')) throw new Error('readwise_execution_eligibility_lost');
}

function publishProgress(
  window: ReadwiseImportProgressWindow | null | undefined,
  processedCount: number,
  totalCount: number,
  phase: 'fetching' | 'source_completed' | 'writing',
  sourceProcessedCount?: number
) {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL, {
    phase, processedCount, ...(sourceProcessedCount === undefined ? {} : { sourceProcessedCount }),
    status: phase === 'source_completed' ? 'completed' : 'running', totalCount
  });
}
