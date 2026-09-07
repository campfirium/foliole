export const READWISE_API_IMPORT_STATE_VERSION = 1;

export interface ReadwiseApiAnnotationState {
  blockedAt: string | null;
  contentHash: string;
  kind: 'highlight' | 'note';
  nodeId: string;
  parentRemoteId: string | null;
  remoteId: string;
  sourceUpdatedAt: string | null;
}

export interface ReadwiseApiDocumentImportState {
  annotations: ReadwiseApiAnnotationState[];
  bodyState: 'materialized' | 'unavailable';
  documentBlockedAt: string | null;
  metadata: Record<string, unknown>;
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
    sourceUpdatedAt: text(row.sourceUpdatedAt),
    version: READWISE_API_IMPORT_STATE_VERSION
  };
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
    sourceUpdatedAt: text(row.sourceUpdatedAt)
  }];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
