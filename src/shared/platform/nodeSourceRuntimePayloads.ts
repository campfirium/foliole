import { toRuntimeTextImportResult, type RuntimeTextImportResult } from './importRuntimePayloads';

export interface RuntimeNodeImportSource {
  firstImportedAt: string;
  lastContentFingerprint: string;
  lastImportedAt: string;
  latestNodeId: string | null;
  pdfIndexStatus?: 'failed' | 'indexing' | 'pending' | 'ready' | null;
  pdfIndexedAt?: string | null;
  provider: string;
  sourceFingerprint: string;
  sourceKind: string;
  sourceLocator: string;
  sourceName: string;
}

export interface RuntimeKeepImportItemDetails {
  firstSeenAt: string;
  hasSourceUpdate: boolean;
  highlightPath: string | null;
  keepState: 'draft' | 'enabled' | 'previewed' | null;
  lastImportedAt: string | null;
  lastSeenAt: string;
  lastStatus: 'blocked_deleted' | 'degraded' | 'duplicate' | 'failed' | 'imported';
  primaryPath: string | null;
  ruleId: string;
  ruleLabel: string | null;
  resolvedSourcePath: string | null;
  sourceMtimeMs: number;
  sourcePath: string;
  sourceSizeBytes: number;
  sourceType: 'generic' | 'readwise' | null;
}

export interface RuntimeNodeSourceDetails {
  importRuns: RuntimeTextImportResult[];
  importSource: RuntimeNodeImportSource | null;
  inheritedFromParent: boolean;
  keepImportItem: RuntimeKeepImportItemDetails | null;
  pdfPageDimensions: Array<{
    page: number;
    pageHeight: number | null;
    pageWidth: number | null;
  }>;
  sourceNodeId: string;
}

export interface RuntimeNodeSourceUpdatePreview {
  checkedAt: string;
  currentHighlightCount: number;
  currentContent: string;
  sourceNodeId: string;
  updatedHighlightCount: number;
  updatedContent: string;
}

function isKeepImportItemStatus(value: unknown): value is RuntimeKeepImportItemDetails['lastStatus'] {
  return value === 'blocked_deleted' || value === 'degraded' || value === 'duplicate' || value === 'failed' || value === 'imported';
}

function toRuntimeNodeImportSource(value: unknown): RuntimeNodeImportSource | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.first_imported_at !== 'string' ||
    typeof payload.last_content_fingerprint !== 'string' ||
    typeof payload.last_imported_at !== 'string' ||
    (payload.latest_node_id !== null && typeof payload.latest_node_id !== 'string') ||
    (payload.pdf_index_status !== undefined &&
      payload.pdf_index_status !== null &&
      payload.pdf_index_status !== 'failed' &&
      payload.pdf_index_status !== 'indexing' &&
      payload.pdf_index_status !== 'pending' &&
      payload.pdf_index_status !== 'ready') ||
    (payload.pdf_indexed_at !== undefined && payload.pdf_indexed_at !== null && typeof payload.pdf_indexed_at !== 'string') ||
    typeof payload.provider !== 'string' ||
    typeof payload.source_fingerprint !== 'string' ||
    typeof payload.source_kind !== 'string' ||
    typeof payload.source_locator !== 'string' ||
    typeof payload.source_name !== 'string'
  ) {
    return null;
  }
  return {
    firstImportedAt: payload.first_imported_at,
    lastContentFingerprint: payload.last_content_fingerprint,
    lastImportedAt: payload.last_imported_at,
    latestNodeId: payload.latest_node_id,
    provider: payload.provider,
    sourceFingerprint: payload.source_fingerprint,
    sourceKind: payload.source_kind,
    sourceLocator: payload.source_locator,
    sourceName: payload.source_name,
    ...(Object.prototype.hasOwnProperty.call(payload, 'pdf_index_status')
      ? { pdfIndexStatus: (payload.pdf_index_status as RuntimeNodeImportSource['pdfIndexStatus'] | undefined) ?? null }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, 'pdf_indexed_at')
      ? { pdfIndexedAt: (payload.pdf_indexed_at as string | null | undefined) ?? null }
      : {})
  };
}

function toRuntimeKeepImportItemDetails(value: unknown): RuntimeKeepImportItemDetails | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.first_seen_at !== 'string' ||
    typeof payload.has_source_update !== 'boolean' ||
    (payload.highlight_path !== null && typeof payload.highlight_path !== 'string') ||
    (payload.keep_state !== null && payload.keep_state !== 'draft' && payload.keep_state !== 'enabled' && payload.keep_state !== 'previewed') ||
    (payload.last_imported_at !== null && typeof payload.last_imported_at !== 'string') ||
    typeof payload.last_seen_at !== 'string' ||
    !isKeepImportItemStatus(payload.last_status) ||
    (payload.primary_path !== null && typeof payload.primary_path !== 'string') ||
    typeof payload.rule_id !== 'string' ||
    (payload.rule_label !== null && typeof payload.rule_label !== 'string') ||
    (payload.resolved_source_path !== null && typeof payload.resolved_source_path !== 'string') ||
    typeof payload.source_mtime_ms !== 'number' ||
    typeof payload.source_path !== 'string' ||
    typeof payload.source_size_bytes !== 'number' ||
    (payload.source_type !== null && payload.source_type !== 'generic' && payload.source_type !== 'readwise')
  ) {
    return null;
  }
  return {
    firstSeenAt: payload.first_seen_at,
    hasSourceUpdate: payload.has_source_update,
    highlightPath: payload.highlight_path,
    keepState: payload.keep_state,
    lastImportedAt: payload.last_imported_at,
    lastSeenAt: payload.last_seen_at,
    lastStatus: payload.last_status,
    primaryPath: payload.primary_path,
    ruleId: payload.rule_id,
    ruleLabel: payload.rule_label,
    resolvedSourcePath: payload.resolved_source_path,
    sourceMtimeMs: payload.source_mtime_ms,
    sourcePath: payload.source_path,
    sourceSizeBytes: payload.source_size_bytes,
    sourceType: payload.source_type
  };
}

function toRuntimePdfPageDimension(
  value: unknown
): { page: number; pageHeight: number | null; pageWidth: number | null } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.page !== 'number' ||
    !Number.isInteger(payload.page) ||
    payload.page < 1 ||
    (payload.page_height !== null && typeof payload.page_height !== 'number') ||
    (payload.page_width !== null && typeof payload.page_width !== 'number')
  ) {
    return null;
  }
  return {
    page: payload.page,
    pageHeight: payload.page_height,
    pageWidth: payload.page_width
  };
}

export function toRuntimeNodeSourceDetails(value: unknown): RuntimeNodeSourceDetails | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    !Array.isArray(payload.import_runs) ||
    !Array.isArray(payload.pdf_page_dimensions) ||
    typeof payload.inherited_from_parent !== 'boolean' ||
    typeof payload.source_node_id !== 'string'
  ) {
    return null;
  }
  const importRuns = payload.import_runs.map(toRuntimeTextImportResult);
  const pdfPageDimensions = payload.pdf_page_dimensions.map(toRuntimePdfPageDimension);
  if (importRuns.some((entry) => !entry)) {
    return null;
  }
  if (pdfPageDimensions.some((entry) => !entry)) {
    return null;
  }
  const importSource = payload.import_source === null ? null : toRuntimeNodeImportSource(payload.import_source);
  const keepImportItem = payload.keep_import_item === null ? null : toRuntimeKeepImportItemDetails(payload.keep_import_item);
  if ((payload.import_source !== null && !importSource) || (payload.keep_import_item !== null && !keepImportItem)) {
    return null;
  }
  return {
    importRuns: importRuns.filter((entry): entry is RuntimeTextImportResult => Boolean(entry)),
    importSource,
    inheritedFromParent: payload.inherited_from_parent,
    keepImportItem,
    pdfPageDimensions: pdfPageDimensions.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    sourceNodeId: payload.source_node_id
  };
}

export function toRuntimeNodeSourceUpdatePreview(value: unknown): RuntimeNodeSourceUpdatePreview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.checked_at !== 'string' ||
    typeof payload.current_highlight_count !== 'number' ||
    typeof payload.current_content !== 'string' ||
    typeof payload.source_node_id !== 'string' ||
    typeof payload.updated_highlight_count !== 'number' ||
    typeof payload.updated_content !== 'string'
  ) {
    return null;
  }
  return {
    checkedAt: payload.checked_at,
    currentHighlightCount: payload.current_highlight_count,
    currentContent: payload.current_content,
    sourceNodeId: payload.source_node_id,
    updatedHighlightCount: payload.updated_highlight_count,
    updatedContent: payload.updated_content
  };
}
