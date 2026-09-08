export const READWISE_SOURCE_CUTOVER_KEY = 'readwise_source_cutover';
export const READWISE_SOURCE_CUTOVER_VERSION = 1;

export interface ReadwiseSourceCutover {
  completedAt: string;
  migratedCount: number;
  sourceHost: string;
  unmatchedCount: number;
  version: number;
}

export function normalizeReadwiseSourceCutover(value: unknown): ReadwiseSourceCutover | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (
    payload.version !== READWISE_SOURCE_CUTOVER_VERSION ||
    typeof payload.completedAt !== 'string' ||
    typeof payload.sourceHost !== 'string' ||
    typeof payload.migratedCount !== 'number' ||
    typeof payload.unmatchedCount !== 'number'
  ) return null;
  return {
    completedAt: payload.completedAt,
    migratedCount: Math.max(0, Math.floor(payload.migratedCount)),
    sourceHost: payload.sourceHost,
    unmatchedCount: Math.max(0, Math.floor(payload.unmatchedCount)),
    version: READWISE_SOURCE_CUTOVER_VERSION
  };
}
