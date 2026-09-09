export const READWISE_SOURCE_CUTOVER_KEY = 'readwise_source_cutover';
export const READWISE_SOURCE_CUTOVER_VERSION = 1;

export type ReadwiseSourceCutoverStatus = 'api' | 'migration-in-progress';

export interface ReadwiseSourceCutover {
  completedAt: string;
  completedCandidateCount: number;
  migratedCount: number;
  sourceHost: string;
  startedAt: string;
  status: ReadwiseSourceCutoverStatus;
  totalCandidateCount: number | null;
  unmatchedCount: number;
  version: number;
}

export function normalizeReadwiseSourceCutover(value: unknown): ReadwiseSourceCutover | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (payload.version === 1 && payload.status === undefined && typeof payload.completedAt === 'string' &&
    typeof payload.sourceHost === 'string' && typeof payload.migratedCount === 'number' &&
    typeof payload.unmatchedCount === 'number') {
    return {
      completedAt: payload.completedAt,
      completedCandidateCount: 0,
      migratedCount: Math.max(0, Math.floor(payload.migratedCount)),
      sourceHost: payload.sourceHost,
      startedAt: payload.completedAt,
      status: 'api',
      totalCandidateCount: null,
      unmatchedCount: Math.max(0, Math.floor(payload.unmatchedCount)),
      version: READWISE_SOURCE_CUTOVER_VERSION
    };
  }
  if (payload.version !== READWISE_SOURCE_CUTOVER_VERSION ||
    typeof payload.completedAt !== 'string' ||
    typeof payload.sourceHost !== 'string' ||
    typeof payload.startedAt !== 'string' ||
    (payload.status !== 'api' && payload.status !== 'migration-in-progress') ||
    typeof payload.completedCandidateCount !== 'number' ||
    typeof payload.migratedCount !== 'number' ||
    (payload.totalCandidateCount !== null && typeof payload.totalCandidateCount !== 'number') ||
    typeof payload.unmatchedCount !== 'number'
  ) return null;
  return {
    completedAt: payload.completedAt,
    completedCandidateCount: Math.max(0, Math.floor(payload.completedCandidateCount)),
    migratedCount: Math.max(0, Math.floor(payload.migratedCount)),
    sourceHost: payload.sourceHost,
    startedAt: payload.startedAt,
    status: payload.status,
    totalCandidateCount: payload.totalCandidateCount === null
      ? null : Math.max(0, Math.floor(payload.totalCandidateCount)),
    unmatchedCount: Math.max(0, Math.floor(payload.unmatchedCount)),
    version: READWISE_SOURCE_CUTOVER_VERSION
  };
}
