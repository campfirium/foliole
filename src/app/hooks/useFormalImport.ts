import { useCallback, useEffect } from 'react';

import { hasAppRuntimeCommandRepository } from '../../shared/platform/appRuntimeCommandRepository';
import {
  runRuntimeClipboardImport,
  runRuntimeDirectoryImport
} from '../../shared/platform/importExecutionRuntimeRepository';
import { loadRuntimeImportOverview } from '../../shared/platform/importOverviewRuntimeRepository';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';

import { runFormalImportFileFlow, type FormalImportFileFlowOptions } from './formalImportFileFlow';
import {
  runImportFlow,
  shouldRehydrateDirectoryImport,
  shouldRehydrateWorkspace
} from './formalImportFlowRunner';
import { runResetImportDataFlow } from './formalImportReset';
import {
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
import {
  hasHandledImportWorkspaceChange,
  markImportWorkspaceChangeHandled,
  resetAppliedImportWorkspacePatches
} from './formalImportWorkspacePatch';
import { useManagedInboxFocusRefresh, useManagedInboxUpdateSubscription } from './useManagedInboxRefresh';

export {
  getFormalImportFailureMessage,
  getFormalImportLatestResult
};

let managedInboxRefreshInFlight: Promise<void> | null = null;
let managedInboxQueuedRefreshImportId: string | null = null;

async function refreshFormalImportOverview(
  triggerImportId?: string,
  options: { rehydrateFreshResult?: boolean } = {}
) {
  const overview = await loadRuntimeImportOverview();
  if (!overview) {
    return;
  }

  const latestResult = overview.latestResult;
  const previousImportId = useFormalImportState.getState().lastSeenResultImportId;
  const nextImportId = triggerImportId ?? latestResult?.importId ?? null;
  const hasFreshImport = Boolean(nextImportId && nextImportId !== previousImportId);
  const triggeredLatestResult = triggerImportId && latestResult?.importId === triggerImportId ? latestResult : null;
  if (
    triggeredLatestResult &&
    !hasHandledImportWorkspaceChange(triggerImportId) &&
    shouldRehydrateWorkspace(triggeredLatestResult)
  ) {
    await refreshWorkspaceState('managed-inbox');
    markImportWorkspaceChangeHandled(triggerImportId);
  } else if (
    !triggerImportId &&
    options.rehydrateFreshResult !== false &&
    latestResult &&
    hasFreshImport &&
    shouldRehydrateWorkspace(latestResult)
  ) {
    await refreshWorkspaceState('formal-import');
  }

  useFormalImportState.setState({
    hasLoadedOverview: true,
    lastSeenResultImportId: nextImportId,
    overview,
    status: buildStatusFromOverview(overview)
  });
}

export function resetFormalImportState() {
  managedInboxRefreshInFlight = null;
  managedInboxQueuedRefreshImportId = null;
  resetAppliedImportWorkspacePatches();
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

function useFormalImportBootstrap(isAvailable: boolean, hasLoadedOverview: boolean) {
  useEffect(() => {
    if (!isAvailable || hasLoadedOverview) {
      return;
    }
    void refreshFormalImportOverview(undefined, { rehydrateFreshResult: false });
  }, [hasLoadedOverview, isAvailable]);
  useManagedInboxUpdateSubscription(isAvailable, refreshManagedInboxOverview);
  useManagedInboxFocusRefresh(isAvailable, refreshManagedInboxOverview);
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
        () => refreshFormalImportOverview(undefined, { rehydrateFreshResult: false }),
        applyImportResultStatus
      ),
    []
  );
  const startImportFile = useCallback(
    (options?: FormalImportFileFlowOptions) =>
      runImportFlow(
        () => runFormalImportFileFlow(options),
        shouldRehydrateWorkspace,
        () => refreshFormalImportOverview(undefined, { rehydrateFreshResult: false }),
        applyImportResultStatus
      ),
    []
  );
  const startImportDirectory = useCallback(
    () =>
      runImportFlow(
        runRuntimeDirectoryImport,
        shouldRehydrateDirectoryImport,
        () => refreshFormalImportOverview(undefined, { rehydrateFreshResult: false })
      ),
    []
  );
  const resetImportData = useCallback(
    () =>
      runResetImportDataFlow({
        getIsImporting: () => useFormalImportState.getState().isImporting,
        rehydrateWorkspace: () => refreshWorkspaceState('import-overview-reset'),
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
