import { useCallback, useEffect } from 'react';
import { create } from 'zustand';

import { getRuntimeInvoke, onManagedInboxUpdated } from '../../shared/platform/bridge';
import {
  loadRuntimeImportOverview,
  runRuntimeDirectoryImport,
  runRuntimeTextFileImport,
  type RuntimeDirectoryImportResult,
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
  lastSeenResultImportId: string | null;
  overview: RuntimeImportOverview;
  status: FormalImportStatus;
}

const useFormalImportState = create<FormalImportUiState>(() => ({
  hasLoadedOverview: false,
  isImporting: false,
  lastSeenResultImportId: null,
  overview: DEFAULT_IMPORT_OVERVIEW,
  status: DEFAULT_FORMAL_IMPORT_STATUS
}));

let managedInboxRefreshInFlight: Promise<void> | null = null;

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
    lastSeenResultImportId: result.importId,
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

  const latestResult = overview.latestResult;
  const previousImportId = useFormalImportState.getState().lastSeenResultImportId;
  const hasFreshImport = Boolean(latestResult && latestResult.importId !== previousImportId);
  if (latestResult && hasFreshImport && shouldRehydrateWorkspace(latestResult)) {
    await useWorkspaceStore.persist.rehydrate();
  }

  useFormalImportState.setState({
    hasLoadedOverview: true,
    lastSeenResultImportId: latestResult?.importId ?? null,
    overview,
    status: buildStatusFromOverview(overview)
  });
}

function shouldRehydrateWorkspace(result: RuntimeTextImportResult) {
  return result.resultStatus === 'imported' && result.duplicateSemantic !== 'duplicate';
}

function shouldRehydrateDirectoryImport(result: RuntimeDirectoryImportResult) {
  return result.entries.some((entry) => shouldRehydrateWorkspace(entry));
}

export function resetFormalImportState() {
  managedInboxRefreshInFlight = null;
  useFormalImportState.setState({
    hasLoadedOverview: false,
    isImporting: false,
    lastSeenResultImportId: null,
    overview: DEFAULT_IMPORT_OVERVIEW,
    status: DEFAULT_FORMAL_IMPORT_STATUS
  });
}

async function refreshManagedInboxOverview() {
  if (managedInboxRefreshInFlight) {
    await managedInboxRefreshInFlight;
    return;
  }
  managedInboxRefreshInFlight = refreshFormalImportOverview().finally(() => {
    managedInboxRefreshInFlight = null;
  });
  await managedInboxRefreshInFlight;
}

function useManagedInboxUpdateSubscription(isAvailable: boolean) {
  useEffect(() => {
    if (!isAvailable) {
      return;
    }
    let isDisposed = false;
    let unlisten: (() => void) | null = null;
    void onManagedInboxUpdated(() => {
      if (isDisposed) {
        return;
      }
      void refreshManagedInboxOverview();
    }).then((nextUnlisten) => {
      if (isDisposed) {
        nextUnlisten?.();
        return;
      }
      unlisten = nextUnlisten;
    });
    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [isAvailable]);
}

function useFormalImportBootstrap(isAvailable: boolean, hasLoadedOverview: boolean) {
  useEffect(() => {
    if (!isAvailable || hasLoadedOverview) {
      return;
    }
    void refreshFormalImportOverview();
  }, [hasLoadedOverview, isAvailable]);
  useManagedInboxUpdateSubscription(isAvailable);
}

function useFormalImportActions() {
  const startImportFile = useCallback(() => runImportFlow(runRuntimeTextFileImport, shouldRehydrateWorkspace, true), []);
  const startImportDirectory = useCallback(
    () => runImportFlow(runRuntimeDirectoryImport, shouldRehydrateDirectoryImport, false),
    []
  );
  return { startImportDirectory, startImportFile };
}

async function runImportFlow<Result extends RuntimeTextImportResult | RuntimeDirectoryImportResult>(
  runner: () => Promise<Result | null>,
  shouldRehydrate: (result: Result) => boolean,
  applyResultStatus: boolean
) {
  if (useFormalImportState.getState().isImporting) {
    return false;
  }
  useFormalImportState.setState({ isImporting: true });
  try {
    const importResult = await runner();
    if (!importResult) {
      applyCancelledImportStatus();
      return false;
    }
    if (shouldRehydrate(importResult) || applyResultStatus) {
      await useWorkspaceStore.persist.rehydrate();
    }
    if (applyResultStatus) {
      applyImportResultStatus(importResult as RuntimeTextImportResult);
    }
    await refreshFormalImportOverview();
    useFormalImportState.setState({ isImporting: false });
    return true;
  } catch (error) {
    applyImportFailureStatus(error instanceof Error ? error.message : 'Unknown import failure');
    return false;
  }
}

export function useFormalImport() {
  const hasLoadedOverview = useFormalImportState((state) => state.hasLoadedOverview);
  const isImporting = useFormalImportState((state) => state.isImporting);
  const overview = useFormalImportState((state) => state.overview);
  const status = useFormalImportState((state) => state.status);
  const isAvailable = Boolean(getRuntimeInvoke());
  const actions = useFormalImportActions();

  useFormalImportBootstrap(isAvailable, hasLoadedOverview);
  return {
    isAvailable,
    isImporting,
    overview,
    ...actions,
    status
  };
}
