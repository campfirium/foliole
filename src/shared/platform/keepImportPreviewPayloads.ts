export interface RuntimeKeepImportPreviewEntry {
  detail: string | null;
  sourcePath: string;
  status: 'blocked_deleted' | 'failed' | 'new' | 'unchanged' | 'updated';
}

export interface RuntimeKeepImportPreviewResult {
  blockedCount: number;
  discoveredCount: number;
  entries: RuntimeKeepImportPreviewEntry[];
  failedCount: number;
  newCount: number;
  previewedAt: string;
  rootPath: string;
  unchangedCount: number;
  updatedCount: number;
}

function isKeepImportStatus(value: unknown): value is RuntimeKeepImportPreviewEntry['status'] {
  return value === 'new' || value === 'updated' || value === 'unchanged' || value === 'blocked_deleted' || value === 'failed';
}

export function toRuntimeKeepImportPreviewResult(value: unknown): RuntimeKeepImportPreviewResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.root_path !== 'string' ||
    typeof payload.previewed_at !== 'string' ||
    typeof payload.discovered_count !== 'number' ||
    typeof payload.new_count !== 'number' ||
    typeof payload.updated_count !== 'number' ||
    typeof payload.unchanged_count !== 'number' ||
    typeof payload.blocked_count !== 'number' ||
    typeof payload.failed_count !== 'number' ||
    !Array.isArray(payload.entries)
  ) {
    return null;
  }
  const entries = payload.entries.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return null;
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record.source_path !== 'string' ||
      !isKeepImportStatus(record.status) ||
      (record.detail !== null && typeof record.detail !== 'string')
    ) {
      return null;
    }
    return {
      detail: record.detail,
      sourcePath: record.source_path,
      status: record.status
    } satisfies RuntimeKeepImportPreviewEntry;
  });
  if (entries.some((entry) => !entry)) {
    return null;
  }
  return {
    blockedCount: payload.blocked_count,
    discoveredCount: payload.discovered_count,
    entries: entries.filter((entry): entry is RuntimeKeepImportPreviewEntry => Boolean(entry)),
    failedCount: payload.failed_count,
    newCount: payload.new_count,
    previewedAt: payload.previewed_at,
    rootPath: payload.root_path,
    unchangedCount: payload.unchanged_count,
    updatedCount: payload.updated_count
  };
}
