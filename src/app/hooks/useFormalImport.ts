import { useCallback, useEffect } from 'react';
import { create } from 'zustand';

import { getRuntimeInvoke } from '../../shared/platform/bridge';
import {
  loadRuntimeImportOverview,
  runRuntimeTextFileImport,
  type RuntimeImportOverview,
  type RuntimeTextImportResult
} from '../../shared/platform/importBridge';
import { useWorkspaceStore } from '../../store/workspaceStore';

export interface FormalImportStatus {
  failures: string;
  inboxLanding: string;
  lastRun: string;
}

const DEFAULT_FORMAL_IMPORT_STATUS: FormalImportStatus = {
  failures: 'Nothing recorded',
  inboxLanding: 'Imported files land as child nodes under Inbox',
  lastRun: 'No imports yet'
};

const DEFAULT_IMPORT_OVERVIEW: RuntimeImportOverview = {
  latestFailure: null,
  latestResult: null,
  recentRuns: []
};

interface FormalImportUiState {
  hasLoadedOverview: boolean;
  isImporting: boolean;
  overview: RuntimeImportOverview;
  status: FormalImportStatus;
}

const useFormalImportState = create<FormalImportUiState>(() => ({
  hasLoadedOverview: false,
  isImporting: false,
  overview: DEFAULT_IMPORT_OVERVIEW,
  status: DEFAULT_FORMAL_IMPORT_STATUS
}));

function formatImportTimestamp(timestamp: string) {
  return timestamp.replace('T', ' ').slice(0, 16);
}

function buildSuccessStatus(result: RuntimeTextImportResult, timestamp: string): FormalImportStatus {
  if (result.resultStatus === 'degraded') {
    return {
      failures: result.degradedReason ?? 'Import degraded',
      inboxLanding: `Degraded import recorded for ${result.sourceName}`,
      lastRun: `Import degraded ${result.sourceName} · ${timestamp}`
    };
  }
  if (result.resultStatus === 'failed') {
    return {
      ...useFormalImportState.getState().status,
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

function buildStatusFromOverview(overview: RuntimeImportOverview): FormalImportStatus {
  const latestResult = overview.latestResult;
  const latestFailure = overview.latestFailure;
  return {
    failures: latestFailure
      ? `${latestFailure.sourceName} · ${latestFailure.failureReason ?? 'Unknown import failure'}`
      : DEFAULT_FORMAL_IMPORT_STATUS.failures,
    inboxLanding: latestResult
      ? buildSuccessStatus(latestResult, formatImportTimestamp(latestResult.importedAt)).inboxLanding
      : DEFAULT_FORMAL_IMPORT_STATUS.inboxLanding,
    lastRun: latestResult
      ? buildSuccessStatus(latestResult, formatImportTimestamp(latestResult.importedAt)).lastRun
      : DEFAULT_FORMAL_IMPORT_STATUS.lastRun
  };
}

function applyImportResultStatus(result: RuntimeTextImportResult) {
  useFormalImportState.setState({
    isImporting: false,
    status: buildSuccessStatus(result, formatImportTimestamp(result.importedAt))
  });
}

function applyCancelledImportStatus() {
  useFormalImportState.setState((current) => ({
    isImporting: false,
    status: {
      ...current.status,
      lastRun: 'Import cancelled'
    }
  }));
}

function applyImportFailureStatus(message: string) {
  useFormalImportState.setState({
    isImporting: false,
    status: {
      ...useFormalImportState.getState().status,
      failures: message,
      lastRun: 'Import failed'
    }
  });
}

async function refreshFormalImportOverview() {
  const overview = await loadRuntimeImportOverview();
  if (!overview) {
    return;
  }
  useFormalImportState.setState({
    hasLoadedOverview: true,
    overview,
    status: buildStatusFromOverview(overview)
  });
}

function shouldRehydrateWorkspace(result: RuntimeTextImportResult) {
  return result.resultStatus === 'imported' && result.duplicateSemantic !== 'duplicate';
}

export function resetFormalImportState() {
  useFormalImportState.setState({
    hasLoadedOverview: false,
    isImporting: false,
    overview: DEFAULT_IMPORT_OVERVIEW,
    status: DEFAULT_FORMAL_IMPORT_STATUS
  });
}

export function useFormalImport() {
  const hasLoadedOverview = useFormalImportState((state) => state.hasLoadedOverview);
  const isImporting = useFormalImportState((state) => state.isImporting);
  const overview = useFormalImportState((state) => state.overview);
  const status = useFormalImportState((state) => state.status);
  const isAvailable = Boolean(getRuntimeInvoke());

  useEffect(() => {
    if (!isAvailable || hasLoadedOverview) {
      return;
    }
    void refreshFormalImportOverview();
  }, [hasLoadedOverview, isAvailable]);

  const startImport = useCallback(async () => {
    if (useFormalImportState.getState().isImporting) {
      return false;
    }

    useFormalImportState.setState({ isImporting: true });
    try {
      const importResult = await runRuntimeTextFileImport();
      if (!importResult) {
        applyCancelledImportStatus();
        return false;
      }

      if (shouldRehydrateWorkspace(importResult)) {
        await useWorkspaceStore.persist.rehydrate();
      }
      applyImportResultStatus(importResult);
      await refreshFormalImportOverview();
      return true;
    } catch (error) {
      applyImportFailureStatus(error instanceof Error ? error.message : 'Unknown import failure');
      return false;
    }
  }, []);

  return {
    isAvailable,
    isImporting,
    overview,
    startImport,
    status
  };
}
