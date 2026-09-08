import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { resolveReadwiseImportDestination } from '../../lib/core/import/readwiseReaderSettings.js';
import { prepareReadwiseApiDocuments, type PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import type {
  NativeReadwiseSyncPreviewEntry,
  NativeReadwiseSyncPreviewResult
} from '../../lib/platform/nativeImportContract.js';
import {
  hasActiveReadwiseApiExternalDocument,
  hasReadwiseApiExternalDocumentChanged,
  loadReadwiseApiExternalDocumentState
} from '../database/readwiseApiExternalDocuments.js';
import {
  loadReadwiseApiImportSource,
  loadStagedReadwiseApiContracts
} from '../database/readwiseApiImportState.js';

const MAX_PARENT_BATCH = 50;

export function buildReadwiseApiPreview(
  settings: ImportManagerSettings,
  connectionRef: string
): NativeReadwiseSyncPreviewResult {
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

export function selectReadwiseApiBatch(
  settings: ImportManagerSettings,
  connectionRef: string
) {
  const documents = prepareStagedDocuments(connectionRef);
  const entries = documents.map((document) => buildEntry(settings, connectionRef, document));
  const writableIds = new Set(entries
    .filter((entry) => entry.status === 'new' || entry.status === 'updated')
    .slice(0, MAX_PARENT_BATCH)
    .map((entry) => entry.remote_document_id));
  const offExternalIds = new Set(entries.flatMap((entry) => {
    const remoteId = entry.remote_document_id;
    return typeof remoteId === 'string' && entry.destination === 'off'
      && hasActiveReadwiseApiExternalDocument(connectionRef, remoteId) ? [remoteId] : [];
  }));
  return documents
    .filter((document) => writableIds.has(document.id) || offExternalIds.has(document.id));
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
  const canResolveOriginalFile = destination === 'inbox' && document.category === 'pdf';
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
    staged.exportBooks
  );
}

function isWritable(entry: NativeReadwiseSyncPreviewEntry) {
  return entry.destination !== 'off' && (entry.status === 'new' || entry.status === 'updated');
}
