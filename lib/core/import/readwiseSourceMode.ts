export const READWISE_SOURCE_MODE_KEY = 'readwise_source_mode';
export const READWISE_SOURCE_MODE_CONFLICT_KEY = 'readwise_source_mode_conflict';
export const READWISE_SOURCE_MODE_VERSION = 1;

export type ReadwiseSourceMode = 'api' | 'off' | 'relay';

export interface ReadwiseSourceModeSetting {
  completion?: ReadwiseSourceModeCompletion;
  mode: ReadwiseSourceMode;
  version: typeof READWISE_SOURCE_MODE_VERSION;
}

export interface ReadwiseSourceModeCompletion {
  batchId: string | null;
  completedAt: string;
  sourceHost: string;
  startedAt: string;
}

export interface ReadwiseSourceModeConflict {
  reasons: string[];
  version: 1;
}

export function normalizeReadwiseSourceMode(value: unknown): ReadwiseSourceModeSetting {
  const payload = record(value);
  if (payload.version !== READWISE_SOURCE_MODE_VERSION || !isReadwiseSourceMode(payload.mode)) {
    throw new Error('readwise_source_mode_invalid');
  }
  const completion = normalizeCompletion(payload.completion);
  if (payload.mode === 'api' && !completion) throw new Error('readwise_source_mode_completion_missing');
  return {
    ...(completion ? { completion } : {}),
    mode: payload.mode,
    version: READWISE_SOURCE_MODE_VERSION
  };
}

export function normalizeReadwiseSourceModeConflict(value: unknown): ReadwiseSourceModeConflict | null {
  if (value === null || value === undefined) return null;
  const payload = record(value);
  if (payload.version !== 1 || !Array.isArray(payload.reasons)) {
    throw new Error('readwise_source_mode_conflict_invalid');
  }
  const reasons = payload.reasons.filter((item): item is string =>
    typeof item === 'string' && item.trim().length > 0
  );
  if (reasons.length !== payload.reasons.length || new Set(reasons).size !== reasons.length) {
    throw new Error('readwise_source_mode_conflict_invalid');
  }
  return { reasons, version: 1 };
}

export function isReadwiseSourceMode(value: unknown): value is ReadwiseSourceMode {
  return value === 'api' || value === 'off' || value === 'relay';
}

export function normalizeLegacyReadwiseSourceMode(value: unknown): ReadwiseSourceMode | null {
  if (value === 'folder' || value === 'relay') return 'relay';
  return value === 'api' || value === 'off' ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('readwise_source_mode_invalid');
  }
  return value as Record<string, unknown>;
}

function normalizeCompletion(value: unknown): ReadwiseSourceModeCompletion | null {
  if (value === undefined || value === null) return null;
  const payload = record(value);
  if (typeof payload.completedAt !== 'string' || typeof payload.sourceHost !== 'string'
    || typeof payload.startedAt !== 'string'
    || (payload.batchId !== null && typeof payload.batchId !== 'string')) {
    throw new Error('readwise_source_mode_completion_invalid');
  }
  return {
    batchId: payload.batchId,
    completedAt: payload.completedAt,
    sourceHost: payload.sourceHost,
    startedAt: payload.startedAt
  };
}
