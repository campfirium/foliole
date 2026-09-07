import {
  normalizeReadwiseRemoteLifecycle,
  type ReadwiseRemoteLifecycleState
} from './readwiseRemoteLifecycle.js';

export const READWISE_API_IMPORT_STATE_VERSION = 3;

export type ReadwiseApiOriginalFileState =
  | { attachmentId: string; contentHash: string; mimeType: string; reason: null; sizeBytes: number; status: 'localized' }
  | { attachmentId: null; contentHash: null; mimeType: null; reason: string; sizeBytes: null; status: 'html_only' | 'unavailable' };

export interface ReadwiseApiAnnotationState {
  blockedAt: string | null;
  contentHash: string;
  kind: 'highlight' | 'note';
  nodeId: string;
  parentRemoteId: string | null;
  remoteId: string;
  remoteStatus: 'deleted' | 'present' | 'unconfirmed';
  sourceUpdatedAt: string | null;
}

export interface ReadwiseApiDocumentImportState {
  annotations: ReadwiseApiAnnotationState[];
  bodyState: 'materialized' | 'unavailable';
  documentBlockedAt: string | null;
  metadata: Record<string, unknown>;
  remoteLifecycle: ReadwiseRemoteLifecycleState | null;
  originalFile: ReadwiseApiOriginalFileState | null;
  sourceUpdatedAt: string | null;
  version: number;
}

export function normalizeReadwiseApiDocumentImportState(value: unknown): ReadwiseApiDocumentImportState {
  const row = record(value);
  return {
    annotations: Array.isArray(row.annotations)
      ? row.annotations.flatMap(normalizeAnnotation).sort((left, right) => left.remoteId.localeCompare(right.remoteId))
      : [],
    bodyState: row.bodyState === 'unavailable' ? 'unavailable' : 'materialized',
    documentBlockedAt: text(row.documentBlockedAt),
    metadata: record(row.metadata),
    originalFile: normalizeOriginalFileState(row.originalFile),
    remoteLifecycle: normalizeReadwiseRemoteLifecycle(row.remoteLifecycle),
    sourceUpdatedAt: text(row.sourceUpdatedAt),
    version: READWISE_API_IMPORT_STATE_VERSION
  };
}

function normalizeOriginalFileState(value: unknown): ReadwiseApiOriginalFileState | null {
  const row = record(value);
  if (row.status === 'localized') {
    const attachmentId = text(row.attachmentId);
    const contentHash = text(row.contentHash);
    const mimeType = text(row.mimeType);
    const sizeBytes = typeof row.sizeBytes === 'number' && Number.isSafeInteger(row.sizeBytes) && row.sizeBytes > 0
      ? row.sizeBytes : null;
    return attachmentId && contentHash && mimeType && sizeBytes
      ? { attachmentId, contentHash, mimeType, reason: null, sizeBytes, status: 'localized' }
      : null;
  }
  if (row.status === 'html_only' || row.status === 'unavailable') {
    const reason = text(row.reason);
    return reason
      ? { attachmentId: null, contentHash: null, mimeType: null, reason, sizeBytes: null, status: row.status }
      : null;
  }
  return null;
}

function normalizeAnnotation(value: unknown): ReadwiseApiAnnotationState[] {
  const row = record(value);
  const remoteId = text(row.remoteId);
  const nodeId = text(row.nodeId);
  const contentHash = text(row.contentHash);
  const kind = row.kind === 'highlight' || row.kind === 'note' ? row.kind : null;
  if (!remoteId || !nodeId || !contentHash || !kind) return [];
  return [{
    blockedAt: text(row.blockedAt),
    contentHash,
    kind,
    nodeId,
    parentRemoteId: text(row.parentRemoteId),
    remoteId,
    remoteStatus: row.remoteStatus === 'deleted' || row.remoteStatus === 'present'
      ? row.remoteStatus : 'unconfirmed',
    sourceUpdatedAt: text(row.sourceUpdatedAt)
  }];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
