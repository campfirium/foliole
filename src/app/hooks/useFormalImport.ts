import { useCallback, useEffect } from 'react';
import { create } from 'zustand';

import { onManagedInboxUpdated } from '../../shared/platform/bridge';
import { hasAppRuntimeCommandRepository } from '../../shared/platform/appRuntimeCommandRepository';
import {
  loadRuntimeImportOverview,
  runRuntimeClipboardImport,
  runRuntimeDirectoryImport,
  runRuntimeTextFileImport,
  type RuntimeDirectoryImportResult,
  type RuntimeImportOverview,
  type RuntimeTextImportResult
} from '../../shared/platform/importBridge';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { runResetImportDataFlow } from './formalImportReset';
import {
  buildStatusFromOverview,
  buildSuccessStatus,
  DEFAULT_FORMAL_IMPORT_STATUS,
  formatImportTimestamp
} from './formalImportStatus';

export interface FormalImportStatus {
  failures: string;
  inboxLanding: string;
  lastRun: string;
}

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
let managedInboxQueuedRefreshImportId: string | null = null;

function applyImportResultStatus(result: RuntimeTextImportResult) {
  useFormalImportState.setState({
    isImporting: false,
    lastSeenResultImportId: result.importId,
    status: buildSuccessStatus(result, formatImportTimestamp(result.importedAt), useFormalImportState.getState().status)
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

export function getFormalImportFailureMessage() {
  const status = useFormalImportState.getState().status;
  return status.lastRun === 'Import failed' && status.failures ? status.failures : null;
}

async function refreshFormalImportOverview(triggerImportId?: string) {
  const overview = await loadRuntimeImportOverview();
  if (!overview) {
    return;
  }

  const latestResult = overview.latestResult;
  const previousImportId = useFormalImportState.getState().lastSeenResultImportId;
  const nextImportId = triggerImportId ?? latestResult?.importId ?? null;
  const hasFreshImport = Boolean(nextImportId && nextImportId !== previousImportId);
  if (triggerImportId) {
    await useWorkspaceStore.persist.rehydrate();
  } else if (latestResult && hasFreshImport && shouldRehydrateWorkspace(latestResult)) {
    await useWorkspaceStore.persist.rehydrate();
  }

  useFormalImportState.setState({
    hasLoadedOverview: true,
    lastSeenResultImportId: nextImportId,
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
  managedInboxQueuedRefreshImportId = null;
  useFormalImportState.setState({
    hasLoadedOverview: false,
    isImporting: false,
    lastSeenResultImportId: null,
    overview: DEFAULT_IMPORT_OVERVIEW,
    status: DEFAULT_FORMAL_IMPORT_STATUS
  });
}

async function refreshManagedInboxOverview(importId?: string) {
  if (managedInboxRefreshInFlight) {
    managedInboxQueuedRefreshImportId = importId ?? managedInboxQueuedRefreshImportId;
    await managedInboxRefreshInFlight;
    if (managedInboxQueuedRefreshImportId) {
      const queuedImportId = managedInboxQueuedRefreshImportId;
      managedInboxQueuedRefreshImportId = null;
      await refreshManagedInboxOverview(queuedImportId);
    }
    return;
  }
  const nextImportId = importId ?? managedInboxQueuedRefreshImportId ?? undefined;
  managedInboxQueuedRefreshImportId = null;
  managedInboxRefreshInFlight = refreshFormalImportOverview(nextImportId).finally(() => {
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
    void onManagedInboxUpdated((importId) => {
      if (isDisposed) {
        return;
      }
      void refreshManagedInboxOverview(importId);
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

function useManagedInboxFocusRefresh(isAvailable: boolean) {
  useEffect(() => {
    if (!isAvailable || typeof window === 'undefined') {
      return;
    }

    const handleFocus = () => {
      void refreshManagedInboxOverview();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
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
  useManagedInboxFocusRefresh(isAvailable);
}

function useFormalImportActions() {
  const startClipboardImport = useCallback(() => runImportFlow(runRuntimeClipboardImport, shouldRehydrateWorkspace, true), []);
  const startImportFile = useCallback(() => runImportFlow(runRuntimeTextFileImport, shouldRehydrateWorkspace, true), []);
  const startImportDirectory = useCallback(
    () => runImportFlow(runRuntimeDirectoryImport, shouldRehydrateDirectoryImport, false),
    []
  );
  const resetImportData = useCallback(
    () =>
      runResetImportDataFlow({
        getIsImporting: () => useFormalImportState.getState().isImporting,
        rehydrateWorkspace: () => useWorkspaceStore.persist.rehydrate(),
        refreshOverview: refreshFormalImportOverview,
        setFailureStatus: applyImportFailureStatus,
        setImporting: (isImporting) => useFormalImportState.setState({ isImporting }),
        setResetStatus: (deletedRootNodeCount) =>
          useFormalImportState.setState((current) => ({
            isImporting: false,
            status: {
              ...current.status,
              inboxLanding: 'Imported content and records cleared',
              lastRun: `Import reset · ${deletedRootNodeCount} root items removed`
            }
          }))
      }),
    []
  );
  return { resetImportData, startClipboardImport, startImportDirectory, startImportFile };
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
  const isAvailable = hasAppRuntimeCommandRepository();
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
