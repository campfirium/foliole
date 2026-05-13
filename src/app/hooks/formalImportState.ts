import { create } from 'zustand';

import type { RuntimeTextImportResult } from '../../shared/platform/importExecutionRuntimeRepository';
import type { RuntimeImportOverview } from '../../shared/platform/importOverviewRuntimeRepository';

import {
  buildSuccessStatus,
  DEFAULT_FORMAL_IMPORT_STATUS,
  formatImportTimestamp,
  type FormalImportStatus
} from './formalImportStatus';

export const DEFAULT_IMPORT_OVERVIEW: RuntimeImportOverview = {
  latestFailure: null,
  latestResult: null,
  recentRuns: []
};

interface FormalImportUiState {
  hasLoadedOverview: boolean;
  isImporting: boolean;
  lastSeenResultImportId: string | null;
  overview: RuntimeImportOverview;
  status: FormalImportStatus;
}

export const useFormalImportState = create<FormalImportUiState>(() => ({
  hasLoadedOverview: false,
  isImporting: false,
  lastSeenResultImportId: null,
  overview: DEFAULT_IMPORT_OVERVIEW,
  status: DEFAULT_FORMAL_IMPORT_STATUS
}));

export function applyImportResultStatus(result: RuntimeTextImportResult) {
  useFormalImportState.setState((current) => ({
    isImporting: false,
    lastSeenResultImportId: result.importId,
    overview: {
      ...current.overview,
      latestFailure: result.resultStatus === 'failed' ? result : current.overview.latestFailure,
      latestResult: result
    },
    status: buildSuccessStatus(result, formatImportTimestamp(result.importedAt), current.status)
  }));
}

export function applyCancelledImportStatus() {
  useFormalImportState.setState((current) => ({
    isImporting: false,
    status: {
      ...current.status,
      lastRun: 'Import cancelled'
    }
  }));
}

export function applyImportFailureStatus(message: string) {
  useFormalImportState.setState({
    isImporting: false,
    status: {
      ...useFormalImportState.getState().status,
      failures: message,
      lastRun: 'Import failed'
    }
  });
}

export function getFormalImportFailureMessage() {
  const status = useFormalImportState.getState().status;
  return status.lastRun === 'Import failed' && status.failures ? status.failures : null;
}

export function getFormalImportLatestResult() {
  return useFormalImportState.getState().overview.latestResult;
}
