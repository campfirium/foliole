import type { ReadwiseImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { stableReadwiseAnnotationNodeId, type PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import {
  READWISE_API_IMPORT_STATE_VERSION,
  type ReadwiseApiAnnotationState
} from '../../lib/core/readwise/readwiseApiImportState.js';
import { runPreparedImport } from '../database/importPipeline.js';
import {
  hideReadwiseApiExternalDocument,
  upsertReadwiseApiExternalDocument
} from '../database/readwiseApiExternalDocuments.js';
import {
  loadReadwiseApiImportSource,
  saveReadwiseApiImportSource
} from '../database/readwiseApiImportState.js';
import { buildPreparedImportRecord } from '../ipc/importSourcePipeline.js';

import type { PreparedReadwiseApiEpubCover } from './readwiseApiEpubCover.js';
import type { PreparedReadwiseApiEpubImages } from './readwiseApiEpubImages.js';
import { prepareReadwiseApiMaterializationState } from './readwiseApiMaterializationState.js';

export interface ReadwiseApiMaterializationResult {
  annotationCount: number;
  documentId: string;
  status: 'blocked' | 'degraded' | 'external_pending' | 'imported' | 'skipped';
}

export interface ReadwiseApiMaterializationInput {
  allowOriginalEpubReplacement?: boolean;
  config: ReadwiseReaderConfig;
  connectionRef: string;
  destination: ReadwiseImportDestination;
  document: PreparedReadwiseApiDocument;
  forceEpubStructure?: boolean;
  forceInbox?: boolean;
  importedAt?: string;
  preparedEpubCover?: PreparedReadwiseApiEpubCover | null;
  preparedEpubImages?: PreparedReadwiseApiEpubImages | null;
  preserveTrackedAnnotations?: boolean;
  relocationPolicy?: 'first' | 'unique';
  relocateAllAnnotations?: boolean;
  replaceExistingBody?: boolean;
  reimportDeleted?: boolean;
}

export function materializeReadwiseApiDocument(input: ReadwiseApiMaterializationInput): ReadwiseApiMaterializationResult {
  const importedAt = input.importedAt ?? new Date().toISOString();
  const previous = loadReadwiseApiImportSource(input.connectionRef, input.document.id);
  const existing = input.reimportDeleted && previous?.nodeDeleted ? null : previous;
  if (existing?.state.bodyAuthority === 'original_epub' && !input.allowOriginalEpubReplacement) {
    input = {
      ...input,
      forceEpubStructure: false,
      preparedEpubCover: null,
      preparedEpubImages: null,
      replaceExistingBody: false
    };
  }
  const materializesLocally = Boolean(input.forceInbox || existing || input.destination === 'inbox');
  if (existing?.nodeDeleted) {
    saveState(input, existing.sourceFingerprint, existing.annotations, {
      ...existing.state,
      documentBlockedAt: existing.state.documentBlockedAt ?? importedAt
    }, importedAt);
    return result(input.document.id, 'blocked');
  }
  if (!materializesLocally && input.destination === 'external') {
    if (!input.document.body.trim()) return result(input.document.id, 'degraded');
    upsertReadwiseApiExternalDocument({
      connectionRef: input.connectionRef, document: input.document, indexedAt: importedAt
    });
    return result(input.document.id, 'external_pending');
  }
  if (!materializesLocally && input.destination === 'off') {
    hideReadwiseApiExternalDocument(input.connectionRef, input.document.id, importedAt);
    return result(input.document.id, 'skipped');
  }
  if (!input.document.body.trim()) {
    const record = runPreparedImport(prepareReadwiseApiImportRecord(input, existing, importedAt));
    saveState(input, record.sourceFingerprint, existing?.annotations ?? [], {
      annotations: existing?.state.annotations ?? [],
      bodyAuthority: existing?.state.bodyAuthority ?? 'reader_html',
      bodyState: 'unavailable',
      documentBlockedAt: null,
      metadata: input.document.metadata,
      originalFile: existing?.state.originalFile ?? null,
      remoteLifecycle: existing?.state.remoteLifecycle ?? null,
      sourceUpdate: existing?.state.sourceUpdate ?? null,
      sourceUpdatedAt: input.document.updatedAt,
      version: READWISE_API_IMPORT_STATE_VERSION
    }, importedAt);
    return result(input.document.id, 'degraded');
  }
  const materialized = materializeAvailableDocument(input, existing, importedAt);
  if (materialized.status === 'imported') {
    hideReadwiseApiExternalDocument(input.connectionRef, input.document.id, importedAt);
  }
  return materialized;
}

export function shouldPrepareReadwiseApiEpubImages(input: {
  config: ReadwiseReaderConfig;
  connectionRef: string;
  destination: ReadwiseImportDestination;
  document: PreparedReadwiseApiDocument;
  forceEpubStructure?: boolean;
  forceInbox?: boolean;
}) {
  if (input.document.category !== 'epub' || !input.document.epubStructure) return false;
  const existing = loadReadwiseApiImportSource(input.connectionRef, input.document.id);
  if (existing?.state.bodyAuthority === 'original_epub') return false;
  const materializesLocally = Boolean(input.forceInbox || existing || input.destination === 'inbox');
  return materializesLocally && Boolean(input.document.epubStructure.sections.length)
    && (!existing || Boolean(input.forceEpubStructure));
}

function materializeAvailableDocument(
  input: Parameters<typeof materializeReadwiseApiDocument>[0],
  existing: ReturnType<typeof loadReadwiseApiImportSource>,
  importedAt: string
): ReadwiseApiMaterializationResult {
  const { annotationStates, epubResult, newAnnotations } = prepareReadwiseApiMaterializationState(
    input, existing, importedAt, null
  );
  if (epubResult) return epubResult;
  const prepared = prepareReadwiseApiImportRecord(input, existing, importedAt);
  const materialized = newAnnotations.map((annotation) => ({
    content: annotation.content,
    label: null,
    locatorText: annotation.locatorText,
    nodeId: stableReadwiseAnnotationNodeId(input.connectionRef, annotation.remoteId)
  }));
  prepared.matchedHighlights = materialized.filter((annotation) => annotation.locatorText);
  prepared.unmatchedHighlights = materialized.filter((annotation) => !annotation.locatorText);
  const record = runPreparedImport(prepared);
  if (!record.nodeId) return result(input.document.id, 'degraded');

  const nextAnnotationStates = [
    ...annotationStates,
    ...newAnnotations.map((annotation): ReadwiseApiAnnotationState => ({
      blockedAt: null,
      contentHash: annotation.contentHash,
      kind: annotation.kind,
      nodeId: stableReadwiseAnnotationNodeId(input.connectionRef, annotation.remoteId),
      parentRemoteId: annotation.parentRemoteId,
      remoteId: annotation.remoteId,
      remoteStatus: 'present',
      sourceUpdatedAt: annotation.updatedAt
    }))
  ];
  const bindings = nextAnnotationStates.map(({ kind, nodeId, remoteId }) => ({ kind, nodeId, remoteId }));
  saveState(input, record.sourceFingerprint, bindings, {
    annotations: nextAnnotationStates,
    bodyAuthority: existing?.state.bodyAuthority ?? 'reader_html',
    bodyState: 'materialized',
    documentBlockedAt: null,
    metadata: input.document.metadata,
    originalFile: existing?.state.originalFile ?? null,
    remoteLifecycle: existing?.state.remoteLifecycle ?? null,
    sourceUpdate: null,
    sourceUpdatedAt: input.document.updatedAt,
    version: READWISE_API_IMPORT_STATE_VERSION
  }, importedAt);
  return { annotationCount: newAnnotations.length, documentId: input.document.id, status: 'imported' };
}

export function prepareReadwiseApiImportRecord(
  input: Parameters<typeof materializeReadwiseApiDocument>[0],
  existing: ReturnType<typeof loadReadwiseApiImportSource>,
  importedAt: string
) {
  const prepared = buildPreparedImportRecord({
    filePath: remoteLocator(input.document.id),
    kind: input.document.category === 'pdf' ? 'pdf' : 'html',
    sourceName: `${input.document.title}.${input.document.category === 'pdf' ? 'pdf' : 'html'}`
  }, {
    content: input.replaceExistingBody ? input.document.body : existing?.body ?? input.document.body,
    degradedReason: input.document.degradedReason,
    highlightPolicy: 'reference_only',
    hideTitleHeadingOverride: false,
    importedAt,
    nodeTitleOverride: existing?.title ?? input.document.title,
    sourceIdentity: `readwise/api/${input.connectionRef}/${input.document.id}`,
    sourceLocator: remoteLocator(input.document.id),
    sourceProfile: 'body_with_highlight_sidecar'
  });
  const retainedSource = existing ?? (input.reimportDeleted
    ? loadReadwiseApiImportSource(input.connectionRef, input.document.id) : null);
  if (retainedSource) prepared.sourceFingerprint = retainedSource.sourceFingerprint;
  return prepared;
}

function saveState(
  input: Parameters<typeof materializeReadwiseApiDocument>[0],
  sourceFingerprint: string,
  annotations: Array<{ kind: 'highlight' | 'note'; nodeId: string; remoteId: string }>,
  state: Parameters<typeof saveReadwiseApiImportSource>[0]['state'],
  updatedAt: string
) {
  saveReadwiseApiImportSource({
    annotationsJson: JSON.stringify(annotations),
    connectionRef: input.connectionRef,
    documentId: input.document.id,
    sourceFingerprint,
    state,
    updatedAt
  });
}

function remoteLocator(documentId: string) {
  return `readwise://document/${encodeURIComponent(documentId)}`;
}

function result(documentId: string, status: ReadwiseApiMaterializationResult['status']) {
  return { annotationCount: 0, documentId, status };
}
