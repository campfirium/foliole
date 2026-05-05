import { loadImportOverview } from '../database/importOverview.js';

function toNativeImportResult(record: Awaited<ReturnType<typeof loadImportOverview>>['latestResult']) {
  if (!record) {
    return null;
  }

  return {
    content_fingerprint: record.contentFingerprint,
    degraded_reason: record.degradedReason,
    duplicate_semantic: record.duplicateSemantic,
    failure_reason: record.failureReason,
    import_id: record.importId,
    imported_at: record.importedAt,
    node_id: record.nodeId,
    provider: record.provider,
    result_status: record.resultStatus,
    source_fingerprint: record.sourceFingerprint,
    source_kind: record.sourceKind,
    source_locator: record.sourceLocator,
    source_name: record.sourceName
  };
}

export function toNativeImportOverview() {
  const overview = loadImportOverview();
  return {
    latest_failure: toNativeImportResult(overview.latestFailure),
    latest_result: toNativeImportResult(overview.latestResult),
    recent_runs: overview.recentRuns.map((record) => toNativeImportResult(record))
  };
}
