import type { PreparedReadwiseApiDocument } from './readwiseApiImport.js';
import { normalizeStoredReadwiseSourceCutover } from './readwiseSourceCutoverNormalization.js';

export const READWISE_SOURCE_CUTOVER_KEY = 'readwise_source_cutover';
export const READWISE_SOURCE_CUTOVER_JOURNAL_KEY = 'readwise_source_cutover_v2';
export const READWISE_SOURCE_CUTOVER_VERSION = 2;
export const READWISE_SOURCE_CUTOVER_COMPLETION_VERSION = 7;

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

export type ReadwiseSourceCutoverFailureStage = 'preparing' | 'resources' | 'writing' | 'recording';

export interface ReadwiseSourceCutoverActiveDocument {
  remoteId: string;
  stage: ReadwiseSourceCutoverFailureStage;
  startedAt: string;
  title: string;
}

export interface ReadwiseSourceCutoverFailure {
  reason: string;
  remoteId: string;
  stage: ReadwiseSourceCutoverFailureStage;
  title: string;
}

export interface ReadwiseSourceCutoverLegacyMatch {
  nodeId: string;
  remoteId: string;
}

export interface ReadwisePostCutoverBinding {
  annotationRemoteIds: ReadonlySet<string>;
}

export interface ReadwiseSourceCutover {
  activeDocument?: ReadwiseSourceCutoverActiveDocument;
  annotations: ReadwiseSourceCutoverClassification[];
  batchId?: string;
  cohortDocumentIds: string[];
  completionVersion?: number;
  completedAt: string;
  documents: ReadwiseSourceCutoverClassification[];
  errorReason?: string;
  failures?: ReadwiseSourceCutoverFailure[];
  legacyMatches?: ReadwiseSourceCutoverLegacyMatch[];
  legacyTotal?: number;
  updateDocumentIds?: string[];
  phase?: 'indexing' | 'merging' | null;
  retiredNodeIds: string[];
  sourceHost: string;
  startedAt: string;
  status: ReadwiseSourceCutoverStatus;
  unmatchedLegacy?: Array<{ nodeId: string; reason: string }>;
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
  return normalizeStoredReadwiseSourceCutover(
    value,
    READWISE_SOURCE_CUTOVER_VERSION,
    READWISE_SOURCE_CUTOVER_COMPLETION_VERSION
  );
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
