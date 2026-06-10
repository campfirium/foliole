import { isNodeMutationPatchResult } from './workspaceRuntimeMutationResults';
import type { WorkspaceNodeMutationPatchResult } from './workspaceRuntimeTypes';

export interface RuntimeImportedTextFile {
  fileName: string;
  filePath: string;
  content: string;
  kind: 'epub' | 'html' | 'markdown' | 'pdf' | 'text';
}

export interface RuntimeTextImportResult {
  contentFingerprint: string;
  degradedReason: string | null;
  duplicateSemantic: 'new' | 'updated' | 'duplicate';
  failureReason: string | null;
  importId: string;
  importedAt: string;
  nodeId: string | null;
  nodeMutationPatch?: WorkspaceNodeMutationPatchResult | null;
  provider: 'desktop_text_file';
  resultStatus: 'imported' | 'degraded' | 'failed';
  sourceFingerprint: string;
  sourceKind: 'epub' | 'html' | 'markdown' | 'pdf' | 'text';
  sourceLocator: string;
  sourceName: string;
}

interface RuntimeDirectoryImportEntry extends RuntimeTextImportResult {
  adapter: 'html_directory' | 'markdown_directory' | 'obsidian_vault' | 'text_directory';
}

export interface RuntimeDirectoryImportResult {
  archiveRootPath: string | null;
  consumePolicy: 'archive' | 'clear' | 'keep';
  consumedCount: number;
  discoveredCount: number;
  entries: RuntimeDirectoryImportEntry[];
  failedCount: number;
  importedCount: number;
  nodeMutationPatch?: WorkspaceNodeMutationPatchResult | null;
  rootPath: string;
  sourceAdapter: 'external_directory' | 'foliole_managed_inbox_folder';
}

export interface RuntimeImportOverview {
  latestFailure: RuntimeTextImportResult | null;
  latestResult: RuntimeTextImportResult | null;
  recentRuns: RuntimeTextImportResult[];
}

function isImportKind(value: unknown): value is RuntimeImportedTextFile['kind'] {
  return value === 'epub' || value === 'html' || value === 'markdown' || value === 'pdf' || value === 'text';
}

function isImportSemantic(value: unknown): value is RuntimeTextImportResult['duplicateSemantic'] {
  return value === 'new' || value === 'updated' || value === 'duplicate';
}

function isImportResultStatus(value: unknown): value is RuntimeTextImportResult['resultStatus'] {
  return value === 'imported' || value === 'degraded' || value === 'failed';
}

function isDirectoryImportConsumePolicy(value: unknown): value is RuntimeDirectoryImportResult['consumePolicy'] {
  return value === 'archive' || value === 'clear' || value === 'keep';
}

function isDirectoryImportAdapter(value: unknown): value is RuntimeDirectoryImportResult['sourceAdapter'] {
  return value === 'external_directory' || value === 'foliole_managed_inbox_folder';
}

function isDirectoryImportEntryAdapter(value: unknown): value is RuntimeDirectoryImportEntry['adapter'] {
  return value === 'html_directory' || value === 'markdown_directory' || value === 'obsidian_vault' || value === 'text_directory';
}

export function toRuntimeImportedTextFile(value: unknown): RuntimeImportedTextFile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.file_name !== 'string' ||
    typeof payload.file_path !== 'string' ||
    typeof payload.content !== 'string' ||
    !isImportKind(payload.kind)
  ) {
    return null;
  }
  return {
    content: payload.content,
    fileName: payload.file_name,
    filePath: payload.file_path,
    kind: payload.kind
  };
}

export function toRuntimeTextImportResult(value: unknown): RuntimeTextImportResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.import_id !== 'string' ||
    payload.provider !== 'desktop_text_file' ||
    typeof payload.source_name !== 'string' ||
    typeof payload.source_locator !== 'string' ||
    !isImportKind(payload.source_kind) ||
    typeof payload.source_fingerprint !== 'string' ||
    typeof payload.content_fingerprint !== 'string' ||
    !isImportSemantic(payload.duplicate_semantic) ||
    !isImportResultStatus(payload.result_status) ||
    typeof payload.imported_at !== 'string' ||
    (payload.node_id !== null && typeof payload.node_id !== 'string') ||
    (payload.degraded_reason !== null && typeof payload.degraded_reason !== 'string') ||
    (payload.failure_reason !== null && typeof payload.failure_reason !== 'string')
  ) {
    return null;
  }
  return {
    contentFingerprint: payload.content_fingerprint,
    degradedReason: payload.degraded_reason,
    duplicateSemantic: payload.duplicate_semantic,
    failureReason: payload.failure_reason,
    importId: payload.import_id,
    importedAt: payload.imported_at,
    nodeId: payload.node_id,
    nodeMutationPatch: isNodeMutationPatchResult(payload.node_mutation_patch) ? payload.node_mutation_patch : null,
    provider: payload.provider,
    resultStatus: payload.result_status,
    sourceFingerprint: payload.source_fingerprint,
    sourceKind: payload.source_kind,
    sourceLocator: payload.source_locator,
    sourceName: payload.source_name
  };
}

export function toRuntimeDirectoryImportResult(value: unknown): RuntimeDirectoryImportResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.root_path !== 'string' ||
    !isDirectoryImportAdapter(payload.source_adapter) ||
    !isDirectoryImportConsumePolicy(payload.consume_policy) ||
    typeof payload.discovered_count !== 'number' ||
    typeof payload.imported_count !== 'number' ||
    typeof payload.failed_count !== 'number' ||
    typeof payload.consumed_count !== 'number' ||
    (payload.archive_root_path !== null && typeof payload.archive_root_path !== 'string') ||
    !Array.isArray(payload.entries)
  ) {
    return null;
  }
  const entries = payload.entries.map((entry) => {
    const normalized = toRuntimeTextImportResult(entry);
    if (!normalized) {
      return null;
    }
    const record = entry as Record<string, unknown>;
    if (!isDirectoryImportEntryAdapter(record.adapter)) {
      return null;
    }
    return { ...normalized, adapter: record.adapter };
  });
  if (entries.some((entry) => !entry)) {
    return null;
  }
  return {
    archiveRootPath: payload.archive_root_path,
    consumePolicy: payload.consume_policy,
    consumedCount: payload.consumed_count,
    discoveredCount: payload.discovered_count,
    entries: entries.filter((entry): entry is RuntimeDirectoryImportEntry => Boolean(entry)),
    failedCount: payload.failed_count,
    importedCount: payload.imported_count,
    nodeMutationPatch: isNodeMutationPatchResult(payload.node_mutation_patch) ? payload.node_mutation_patch : null,
    rootPath: payload.root_path,
    sourceAdapter: payload.source_adapter
  };
}

export function toRuntimeImportOverview(value: unknown): RuntimeImportOverview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.recent_runs)) {
    return null;
  }
  const recentRuns = payload.recent_runs.map(toRuntimeTextImportResult);
  if (recentRuns.some((entry) => !entry)) {
    return null;
  }
  const latestResult = payload.latest_result === null ? null : toRuntimeTextImportResult(payload.latest_result);
  const latestFailure = payload.latest_failure === null ? null : toRuntimeTextImportResult(payload.latest_failure);
  if ((payload.latest_result !== null && !latestResult) || (payload.latest_failure !== null && !latestFailure)) {
    return null;
  }
  return {
    latestFailure,
    latestResult,
    recentRuns: recentRuns.filter((entry): entry is RuntimeTextImportResult => Boolean(entry))
  };
}
