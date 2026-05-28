import { useCallback, useEffect } from 'react';

import { hasAppRuntimeCommandRepository } from '../../shared/platform/appRuntimeCommandRepository';
import {
  runRuntimeClipboardImport,
  runRuntimeDirectoryImport,
  type RuntimeDirectoryImportResult,
  type RuntimeTextImportResult
} from '../../shared/platform/importExecutionRuntimeRepository';
import { loadRuntimeImportOverview } from '../../shared/platform/importOverviewRuntimeRepository';
import { onManagedInboxUpdated } from '../../shared/platform/runtimeShellEvents';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { runFormalImportFileFlow } from './formalImportFileFlow';
import { runResetImportDataFlow } from './formalImportReset';
import {
  applyCancelledImportStatus,
  applyImportFailureStatus,
  applyImportResultStatus,
  DEFAULT_IMPORT_OVERVIEW,
  getFormalImportFailureMessage,
  getFormalImportLatestResult,
  useFormalImportState
} from './formalImportState';
import {
  buildStatusFromOverview,
  DEFAULT_FORMAL_IMPORT_STATUS
} from './formalImportStatus';

export {
  getFormalImportFailureMessage,
  getFormalImportLatestResult
};

let managedInboxRefreshInFlight: Promise<void> | null = null;
let managedInboxQueuedRefreshImportId: string | null = null;

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
  const startClipboardImport = useCallback(
    (detail?: { targetParentNodeId?: string }) =>
      runImportFlow(
        () => runRuntimeClipboardImport(
          undefined,
          undefined,
          detail?.targetParentNodeId ? { targetParentNodeId: detail.targetParentNodeId } : undefined
        ),
        shouldRehydrateWorkspace,
        applyImportResultStatus
      ),
    []
  );
  const startImportFile = useCallback(() => runImportFlow(runFormalImportFileFlow, shouldRehydrateWorkspace, applyImportResultStatus), []);
  const startImportDirectory = useCallback(
    () => runImportFlow(runRuntimeDirectoryImport, shouldRehydrateDirectoryImport),
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
  applyResultStatus?: (result: Result) => void
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
      applyResultStatus(importResult);
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
