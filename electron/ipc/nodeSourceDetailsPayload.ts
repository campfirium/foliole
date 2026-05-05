import path from 'node:path';

import { formatReadwiseSourceLabel } from '../../lib/core/import/importManagerSettings.js';
import { loadNodeSourceDetails } from '../database/nodeSourceDetails.js';
import { loadImportManagerSettings } from '../import/importManagerSettings.js';

function resolveSourceFilePath(primaryPath: string | null, sourcePath: string) {
  if (path.isAbsolute(sourcePath)) {
    return sourcePath;
  }
  if (!primaryPath) {
    return null;
  }
  return path.join(primaryPath, sourcePath);
}

function toNativeImportRunRow(record: NonNullable<ReturnType<typeof loadNodeSourceDetails>>['importRuns'][number]) {
  return {
    content_fingerprint: record.content_fingerprint,
    degraded_reason: record.degraded_reason,
    duplicate_semantic: record.duplicate_semantic,
    failure_reason: record.failure_reason,
    import_id: record.id,
    imported_at: record.imported_at,
    node_id: record.node_id,
    provider: record.provider,
    result_status: record.result_status,
    source_fingerprint: record.source_fingerprint,
    source_kind: record.source_kind,
    source_locator: record.source_locator,
    source_name: record.source_name
  };
}

function toNativeImportSource(record: NonNullable<ReturnType<typeof loadNodeSourceDetails>>['importSource']) {
  if (!record) {
    return null;
  }
  return {
    first_imported_at: record.first_imported_at,
    last_content_fingerprint: record.last_content_fingerprint,
    last_imported_at: record.last_imported_at,
    latest_node_id: record.latest_node_id,
    provider: record.provider,
    source_fingerprint: record.source_fingerprint,
    source_kind: record.source_kind,
    source_locator: record.source_locator,
    source_name: record.source_name
  };
}

function toNativeKeepImportItem(record: NonNullable<ReturnType<typeof loadNodeSourceDetails>>['keepImportItem']) {
  if (!record) {
    return null;
  }
  const settings = loadImportManagerSettings();
  const readwiseRule = settings.readwiseSources.find((entry) => entry.id === record.rule_id);
  const genericRule = settings.sources.find((entry) => entry.id === record.rule_id);
  const sourceType = readwiseRule ? 'readwise' : genericRule ? 'generic' : null;
  const rule = readwiseRule ?? genericRule ?? null;

  return {
    first_seen_at: record.first_seen_at,
    has_source_update: Boolean(record.has_source_update),
    highlight_path: readwiseRule?.highlightPath ?? rule?.highlightPath ?? null,
    keep_state: rule?.keepState ?? null,
    last_imported_at: record.last_imported_at,
    last_seen_at: record.last_seen_at,
    last_status: record.last_status,
    primary_path: rule?.primaryPath ?? null,
    rule_id: record.rule_id,
    rule_label: readwiseRule?.kind ? `Readwise ${formatReadwiseSourceLabel(readwiseRule.kind).toLowerCase()}` : sourceType === 'generic' ? 'Keep import source' : null,
    resolved_source_path: resolveSourceFilePath(rule?.primaryPath ?? null, record.source_path),
    source_mtime_ms: record.source_mtime_ms,
    source_path: record.source_path,
    source_size_bytes: record.source_size_bytes,
    source_type: sourceType
  };
}

export function toNativeNodeSourceDetails(nodeId: string) {
  const details = loadNodeSourceDetails(nodeId);
  if (!details) {
    return null;
  }
  return {
    import_runs: details.importRuns.map((record) => toNativeImportRunRow(record)),
    import_source: toNativeImportSource(details.importSource),
    inherited_from_parent: details.inheritedFromParent,
    keep_import_item: toNativeKeepImportItem(details.keepImportItem),
    source_node_id: details.sourceNodeId
  };
}
