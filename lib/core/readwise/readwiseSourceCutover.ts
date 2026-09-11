import type { PreparedReadwiseApiDocument } from './readwiseApiImport.js';

export const READWISE_SOURCE_CUTOVER_KEY = 'readwise_source_cutover';
export const READWISE_SOURCE_CUTOVER_JOURNAL_KEY = 'readwise_source_cutover_v2';
export const READWISE_SOURCE_CUTOVER_VERSION = 2;

export type ReadwiseSourceCutoverStatus = 'api' | 'migration-in-progress';

export type ReadwiseSourceCutoverClassificationStatus =
  | 'blocked'
  | 'bound'
  | 'external'
  | 'materialized'
  | 'suppressed'
  | 'unavailable';

export interface ReadwiseSourceCutoverClassification {
  nodeId: string | null;
  reason?: string;
  remoteId: string;
  status: ReadwiseSourceCutoverClassificationStatus;
}

export interface ReadwisePostCutoverBinding {
  annotationRemoteIds: ReadonlySet<string>;
}

export interface ReadwiseSourceCutover {
  annotations: ReadwiseSourceCutoverClassification[];
  batchId?: string;
  cohortDocumentIds: string[];
  completionVersion?: number;
  completedAt: string;
  documents: ReadwiseSourceCutoverClassification[];
  phase?: 'indexing' | 'merging' | null;
  retiredNodeIds: string[];
  sourceHost: string;
  startedAt: string;
  status: ReadwiseSourceCutoverStatus;
  version: 2;
}

export interface LegacyReadwiseSourceCutover {
  completedAt: string;
  completedCandidateCount: number;
  migratedCount: number;
  sourceHost: string;
  startedAt: string;
  status: ReadwiseSourceCutoverStatus;
  totalCandidateCount: number | null;
  unmatchedCount: number;
  version: 1;
}

export type StoredReadwiseSourceCutover = LegacyReadwiseSourceCutover | ReadwiseSourceCutover;

export function normalizeReadwiseSourceCutover(value: unknown): StoredReadwiseSourceCutover | null {
  if (value === null || value === undefined) return null;
  const payload = record(value, 'payload');
  if (payload.version === 1) return normalizeLegacy(payload);
  if (payload.version !== READWISE_SOURCE_CUTOVER_VERSION) {
    throw new Error(`readwise_source_cutover_unknown_version:${String(payload.version)}`);
  }
  const documents = classifications(payload.documents, 'documents');
  const cohortDocumentIds = uniqueStrings(payload.cohortDocumentIds, 'cohortDocumentIds');
  const state: ReadwiseSourceCutover = {
    annotations: classifications(payload.annotations, 'annotations'),
    ...(optionalText(payload.batchId) ? { batchId: optionalText(payload.batchId)! } : {}),
    cohortDocumentIds,
    ...(payload.completionVersion === 2 ? { completionVersion: 2 } : {}),
    completedAt: text(payload.completedAt, 'completedAt'),
    documents,
    phase: cutoverPhase(payload.phase, payload.status),
    retiredNodeIds: uniqueStrings(payload.retiredNodeIds, 'retiredNodeIds'),
    sourceHost: text(payload.sourceHost, 'sourceHost'),
    startedAt: text(payload.startedAt, 'startedAt'),
    status: status(payload.status),
    version: READWISE_SOURCE_CUTOVER_VERSION
  };
  const classifiedDocumentIds = new Set(documents.map((item) => item.remoteId));
  if (state.status === 'api' && cohortDocumentIds.some((id) => !classifiedDocumentIds.has(id))) {
    throw new Error('readwise_source_cutover_incomplete_cohort');
  }
  return state;
}

export function readwiseSourceCutoverProgress(state: StoredReadwiseSourceCutover) {
  if (state.version === 1) return {
    completedCandidateCount: state.completedCandidateCount,
    migratedCount: state.migratedCount,
    totalCandidateCount: state.totalCandidateCount,
    unmatchedCount: state.unmatchedCount
  };
  const cohort = new Set(state.cohortDocumentIds);
  const classified = state.documents.filter((item) => cohort.has(item.remoteId));
  return {
    completedCandidateCount: classified.length,
    migratedCount: classified.filter((item) =>
      item.status === 'bound' || item.status === 'materialized' || item.status === 'external'
    ).length,
    totalCandidateCount: state.cohortDocumentIds.length,
    unmatchedCount: classified.filter((item) =>
      item.status === 'blocked' || item.status === 'suppressed' || item.status === 'unavailable'
    ).length
  };
}

export function filterPostCutoverReadwiseDocument(
  state: StoredReadwiseSourceCutover | null,
  document: PreparedReadwiseApiDocument,
  binding: ReadwisePostCutoverBinding | null = null
): PreparedReadwiseApiDocument | null {
  if (!state || state.version === 1 || state.status !== 'api') return document;
  void binding;
  return document;
}

export function isReadwiseObjectCreatedAfter(
  value: string | null | undefined,
  boundary: string
) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  const boundaryTimestamp = Date.parse(boundary);
  return Number.isFinite(timestamp) && Number.isFinite(boundaryTimestamp) && timestamp > boundaryTimestamp;
}

function normalizeLegacy(payload: Record<string, unknown>): LegacyReadwiseSourceCutover {
  const completedAt = text(payload.completedAt, 'completedAt');
  const statusValue = payload.status === undefined ? 'api' : status(payload.status);
  return {
    completedAt,
    completedCandidateCount: integer(
      payload.completedCandidateCount ?? (statusValue === 'api' ? payload.migratedCount : 0),
      'completedCandidateCount'
    ),
    migratedCount: integer(payload.migratedCount, 'migratedCount'),
    sourceHost: text(payload.sourceHost, 'sourceHost'),
    startedAt: payload.startedAt === undefined ? completedAt : text(payload.startedAt, 'startedAt'),
    status: statusValue,
    totalCandidateCount: payload.totalCandidateCount === undefined || payload.totalCandidateCount === null
      ? null : integer(payload.totalCandidateCount, 'totalCandidateCount'),
    unmatchedCount: integer(payload.unmatchedCount, 'unmatchedCount'),
    version: 1
  };
}

function classifications(value: unknown, name: string): ReadwiseSourceCutoverClassification[] {
  if (!Array.isArray(value)) throw new Error(`readwise_source_cutover_invalid:${name}`);
  const result = value.map((item, index): ReadwiseSourceCutoverClassification => {
    const row = record(item, `${name}.${index}`);
    const itemStatus = row.status;
    if (!isClassificationStatus(itemStatus)) {
      throw new Error(`readwise_source_cutover_invalid:${name}.${index}.status`);
    }
    const requiresNode = itemStatus === 'bound' || itemStatus === 'materialized';
    const allowsNode = requiresNode || itemStatus === 'blocked';
    const nodeId = row.nodeId === null ? null : text(row.nodeId, `${name}.${index}.nodeId`);
    if (requiresNode && !nodeId) {
      throw new Error(`readwise_source_cutover_invalid:${name}.${index}.nodeId`);
    }
    if (!allowsNode && nodeId) {
      throw new Error(`readwise_source_cutover_invalid:${name}.${index}.nodeId`);
    }
    const reason = optionalText(row.reason);
    return {
      nodeId,
      ...(reason ? { reason } : {}),
      remoteId: text(row.remoteId, `${name}.${index}.remoteId`),
      status: itemStatus
    };
  });
  if (new Set(result.map((item) => item.remoteId)).size !== result.length) {
    throw new Error(`readwise_source_cutover_duplicate:${name}`);
  }
  return result;
}

function isClassificationStatus(value: unknown): value is ReadwiseSourceCutoverClassificationStatus {
  return value === 'blocked' || value === 'bound' || value === 'external'
    || value === 'materialized' || value === 'suppressed' || value === 'unavailable';
}

function uniqueStrings(value: unknown, name: string) {
  if (!Array.isArray(value)) throw new Error(`readwise_source_cutover_invalid:${name}`);
  const result = value.map((item, index) => text(item, `${name}.${index}`));
  if (new Set(result).size !== result.length) throw new Error(`readwise_source_cutover_duplicate:${name}`);
  return result;
}

function record(value: unknown, name: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`readwise_source_cutover_invalid:${name}`);
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, name: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`readwise_source_cutover_invalid:${name}`);
  }
  return Math.floor(value);
}

function status(value: unknown): ReadwiseSourceCutoverStatus {
  if (value !== 'api' && value !== 'migration-in-progress') {
    throw new Error('readwise_source_cutover_invalid:status');
  }
  return value;
}

function cutoverPhase(value: unknown, storedStatus: unknown) {
  if (storedStatus === 'api') return null;
  if (value === 'indexing' || value === 'merging') return value;
  return 'indexing' as const;
}

function text(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`readwise_source_cutover_invalid:${name}`);
  return value;
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
