import type { RuntimeTextImportResult } from '../../shared/platform/importExecutionRuntimeRepository';
import type { RuntimeImportOverview } from '../../shared/platform/importOverviewRuntimeRepository';

import type { FormalImportStatus } from './useFormalImport';

export const DEFAULT_FORMAL_IMPORT_STATUS: FormalImportStatus = {
  failures: 'Nothing recorded',
  inboxLanding: 'Imported files land as child nodes under Inbox',
  lastRun: 'No imports yet'
};

export function formatImportTimestamp(timestamp: string) {
  return timestamp.replace('T', ' ').slice(0, 16);
}

export function buildSuccessStatus(
  result: RuntimeTextImportResult,
  timestamp: string,
  previousStatus: FormalImportStatus
): FormalImportStatus {
  if (result.resultStatus === 'degraded') {
    return {
      failures: result.degradedReason ?? 'Import degraded',
      inboxLanding: `Degraded import recorded for ${result.sourceName}`,
      lastRun: `Import degraded ${result.sourceName} · ${timestamp}`
    };
  }
  if (result.resultStatus === 'failed') {
    return {
      ...previousStatus,
      failures: result.failureReason ?? 'Unknown import failure',
      lastRun: `Import failed ${result.sourceName} · ${timestamp}`
    };
  }
  return {
    failures: 'Nothing recorded',
    inboxLanding:
      result.duplicateSemantic === 'duplicate'
        ? `Existing Inbox import reused for ${result.sourceName}`
        : result.duplicateSemantic === 'updated'
          ? `Inbox import updated from ${result.sourceName}`
          : `Inbox child created from ${result.sourceName}`,
    lastRun:
      result.duplicateSemantic === 'duplicate'
        ? `Reused ${result.sourceName} · ${timestamp}`
        : result.duplicateSemantic === 'updated'
          ? `Updated ${result.sourceName} · ${timestamp}`
          : `Imported ${result.sourceName} · ${timestamp}`
  };
}

export function buildStatusFromOverview(overview: RuntimeImportOverview): FormalImportStatus {
  const latestResult = overview.latestResult;
  const latestFailure = overview.latestFailure;
  return {
    failures: latestFailure
      ? `${latestFailure.sourceName} · ${latestFailure.failureReason ?? 'Unknown import failure'}`
      : DEFAULT_FORMAL_IMPORT_STATUS.failures,
    inboxLanding: latestResult
      ? buildSuccessStatus(latestResult, formatImportTimestamp(latestResult.importedAt), DEFAULT_FORMAL_IMPORT_STATUS)
          .inboxLanding
      : DEFAULT_FORMAL_IMPORT_STATUS.inboxLanding,
    lastRun: latestResult
      ? buildSuccessStatus(latestResult, formatImportTimestamp(latestResult.importedAt), DEFAULT_FORMAL_IMPORT_STATUS)
          .lastRun
      : DEFAULT_FORMAL_IMPORT_STATUS.lastRun
  };
}
