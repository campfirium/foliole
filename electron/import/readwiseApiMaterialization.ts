import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { resolveReadwiseImportDestination } from '../../lib/core/import/readwiseReaderSettings.js';
import { stableReadwiseAnnotationNodeId, type PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import {
  READWISE_API_IMPORT_STATE_VERSION,
  type ReadwiseApiAnnotationState
} from '../../lib/core/readwise/readwiseApiImportState.js';
import { openDatabaseConnection } from '../database/connection.js';
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

export interface ReadwiseApiMaterializationResult {
  annotationCount: number;
  documentId: string;
  status: 'blocked' | 'degraded' | 'external_pending' | 'imported' | 'skipped';
}

export function materializeReadwiseApiDocument(input: {
  config: ReadwiseReaderConfig;
  connectionRef: string;
  document: PreparedReadwiseApiDocument;
  forceInbox?: boolean;
  importedAt?: string;
}): ReadwiseApiMaterializationResult {
  const importedAt = input.importedAt ?? new Date().toISOString();
  const existing = loadReadwiseApiImportSource(input.connectionRef, input.document.id);
  const destination = input.forceInbox || existing
    ? 'inbox'
    : resolveReadwiseImportDestination(input.config, input.document.annotations.length > 0);
  if (existing?.nodeDeleted) {
    saveState(input, existing.sourceFingerprint, existing.annotations, {
      ...existing.state,
      documentBlockedAt: existing.state.documentBlockedAt ?? importedAt
    }, importedAt);
    return result(input.document.id, 'blocked');
  }
  if (destination === 'external') {
    if (!input.document.body.trim()) return result(input.document.id, 'degraded');
    upsertReadwiseApiExternalDocument({
      connectionRef: input.connectionRef, document: input.document, indexedAt: importedAt
    });
    return result(input.document.id, 'external_pending');
  }
  if (destination === 'off') {
    hideReadwiseApiExternalDocument(input.connectionRef, input.document.id, importedAt);
    return result(input.document.id, 'skipped');
  }
  if (!input.document.body.trim()) {
    const record = runPreparedImport(prepareRecord(input, existing, importedAt));
    saveState(input, record.sourceFingerprint, existing?.annotations ?? [], {
      annotations: existing?.state.annotations ?? [],
      bodyState: 'unavailable',
      documentBlockedAt: null,
      metadata: input.document.metadata,
      originalFile: existing?.state.originalFile ?? null,
      remoteLifecycle: existing?.state.remoteLifecycle ?? null,
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

function materializeAvailableDocument(
  input: Parameters<typeof materializeReadwiseApiDocument>[0],
  existing: ReturnType<typeof loadReadwiseApiImportSource>,
  importedAt: string
): ReadwiseApiMaterializationResult {
  const annotationStates = resolveAnnotationStates(input, existing, importedAt);
  const newAnnotations = input.document.annotations.filter((annotation) =>
    !annotationStates.some((state) => state.remoteId === annotation.remoteId)
  );
  const prepared = prepareRecord(input, existing, importedAt);
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
    bodyState: 'materialized',
    documentBlockedAt: null,
    metadata: input.document.metadata,
    originalFile: existing?.state.originalFile ?? null,
    remoteLifecycle: existing?.state.remoteLifecycle ?? null,
    sourceUpdatedAt: input.document.updatedAt,
    version: READWISE_API_IMPORT_STATE_VERSION
  }, importedAt);
  return { annotationCount: newAnnotations.length, documentId: input.document.id, status: 'imported' };
}

function prepareRecord(
  input: Parameters<typeof materializeReadwiseApiDocument>[0],
  existing: ReturnType<typeof loadReadwiseApiImportSource>,
  importedAt: string
) {
  const prepared = buildPreparedImportRecord({
    filePath: remoteLocator(input.document.id),
    kind: input.document.category === 'pdf' ? 'pdf' : 'html',
    sourceName: `${input.document.title}.${input.document.category === 'pdf' ? 'pdf' : 'html'}`
  }, {
    content: existing?.body ?? input.document.body,
    degradedReason: input.document.degradedReason,
    highlightPolicy: 'reference_only',
    hideTitleHeadingOverride: false,
    importedAt,
    nodeTitleOverride: existing?.title ?? input.document.title,
    sourceIdentity: `readwise/api/${input.connectionRef}/${input.document.id}`,
    sourceLocator: remoteLocator(input.document.id),
    sourceProfile: 'body_with_highlight_sidecar'
  });
  if (existing) prepared.sourceFingerprint = existing.sourceFingerprint;
  return prepared;
}

function resolveAnnotationStates(
  input: Parameters<typeof materializeReadwiseApiDocument>[0],
  existing: ReturnType<typeof loadReadwiseApiImportSource>,
  now: string
) {
  if (!existing) return [];
  const stateById = new Map(existing.state.annotations.map((annotation) => [annotation.remoteId, annotation]));
  return existing.annotations.map((binding) => {
    const current = stateById.get(binding.remoteId);
    const active = isNodeActive(binding.nodeId);
    const fallback: ReadwiseApiAnnotationState = {
      blockedAt: active ? null : now,
      contentHash: 'legacy-binding',
      kind: binding.kind,
      nodeId: binding.nodeId,
      parentRemoteId: null,
      remoteId: binding.remoteId,
      remoteStatus: 'unconfirmed',
      sourceUpdatedAt: null
    };
    return current ?? fallback;
  }).map((state) => isNodeActive(state.nodeId) || state.blockedAt
    ? state : { ...state, blockedAt: now });
}

function isNodeActive(nodeId: string) {
  return Boolean(openDatabaseConnection().driver.queryOne(
    'SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL', [nodeId]
  ));
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
