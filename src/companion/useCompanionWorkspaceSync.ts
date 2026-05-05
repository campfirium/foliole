import { useEffect, useState } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { isNativeCompanionRuntime } from '../shared/platform/companionBootstrap';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import {
  loadCompanionReadableArticle,
  loadCompanionWorkspaceSyncState,
  loadCompanionWorkspaceVersion,
  pullCompanionWorkspaceSnapshot,
  saveCompanionWorkspaceSyncEndpoint
} from '../shared/platform/companionWorkspaceSync';

import {
  ANDROID_EMULATOR_DEFAULT_ENDPOINT,
  shouldAutoPullInitialDesktopSnapshot,
  shouldPullUpdatedDesktopSnapshot
} from './companionAutoSync';
import { useForegroundAutoSync } from './useCompanionWorkspaceAutoSync';

type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';

const EMPTY_SYNC_STATE: NativeCompanionWorkspaceSyncState = {
  endpoint_url: null,
  last_synced_at: null,
  workspace_snapshot: null
};

async function syncReadableArticle(snapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot']) {
  return loadCompanionReadableArticle(snapshot);
}

async function applyPulledSnapshot(args: {
  cancelled: () => boolean;
  endpointUrl: string;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
}) {
  const syncedState = await pullCompanionWorkspaceSnapshot(args.endpointUrl);
  if (args.cancelled()) {
    return;
  }
  args.setState(syncedState);
  args.setReadableArticle(await syncReadableArticle(syncedState.workspace_snapshot));
  args.setStatus('idle');
}

async function tryAutoPullInitialSnapshot(args: {
  cancelled: () => boolean;
  setError(error: string | null): void;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
  state: NativeCompanionWorkspaceSyncState;
}) {
  if (
    !shouldAutoPullInitialDesktopSnapshot({
      isNativeRuntime: isNativeCompanionRuntime(),
      state: args.state
    })
  ) {
    return false;
  }

  const endpointUrl = args.state.endpoint_url ?? ANDROID_EMULATOR_DEFAULT_ENDPOINT;
  args.setStatus('syncing');
  try {
    const savedState = await saveCompanionWorkspaceSyncEndpoint(endpointUrl);
    if (args.cancelled()) {
      return true;
    }
    args.setState(savedState);
    await applyPulledSnapshot({
      cancelled: args.cancelled,
      endpointUrl,
      setReadableArticle: args.setReadableArticle,
      setState: args.setState,
      setStatus: args.setStatus
    });
    return true;
  } catch (syncError) {
    if (args.cancelled()) {
      return true;
    }
    args.setStatus('idle');
    args.setError(syncError instanceof Error ? syncError.message : 'Desktop sync failed.');
    return true;
  }
}

async function initializeWorkspaceSyncState(args: {
  cancelled: () => boolean;
  setError(error: string | null): void;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
}) {
  const nextState = await loadCompanionWorkspaceSyncState();
  if (args.cancelled()) {
    return;
  }
  args.setState(nextState);
  args.setReadableArticle(await syncReadableArticle(nextState.workspace_snapshot));
  if (
    await tryAutoPullInitialSnapshot({
      cancelled: args.cancelled,
      setError: args.setError,
      setReadableArticle: args.setReadableArticle,
      setState: args.setState,
      setStatus: args.setStatus,
      state: nextState
    })
  ) {
    return;
  }
  args.setStatus('idle');
}

async function tryForegroundAutoSync(args: {
  cancelled: () => boolean;
  setError(error: string | null): void;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
  state: NativeCompanionWorkspaceSyncState;
}) {
  const endpointUrl = args.state.endpoint_url;
  if (!endpointUrl) {
    return;
  }
  args.setStatus('syncing');
  args.setError(null);
  try {
    const version = await loadCompanionWorkspaceVersion(endpointUrl);
    if (
      !version.has_snapshot ||
      !shouldPullUpdatedDesktopSnapshot({
        lastSyncedAt: args.state.last_synced_at,
        remoteExportedAt: version.exported_at
      })
    ) {
      if (!args.cancelled()) {
        args.setStatus('idle');
      }
      return;
    }
    await applyPulledSnapshot({
      cancelled: args.cancelled,
      endpointUrl,
      setReadableArticle: args.setReadableArticle,
      setState: args.setState,
      setStatus: args.setStatus
    });
  } catch (syncError) {
    if (args.cancelled()) {
      return;
    }
    args.setStatus('idle');
    args.setError(syncError instanceof Error ? syncError.message : 'Desktop sync failed.');
  }
}

function useWorkspaceSyncBootstrap(
  setError: (error: string | null) => void,
  setReadableArticle: (article: CompanionReadableArticle | null) => void,
  setState: (state: NativeCompanionWorkspaceSyncState) => void,
  setStatus: (status: CompanionWorkspaceSyncStatus) => void
) {
  useEffect(() => {
    let cancelled = false;

    void initializeWorkspaceSyncState({
      cancelled: () => cancelled,
      setError,
      setReadableArticle,
      setState,
      setStatus
    })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        setStatus('idle');
        setError(loadError instanceof Error ? loadError.message : 'Failed to load companion sync state.');
      });

    return () => {
      cancelled = true;
    };
  }, [setError, setReadableArticle, setState, setStatus]);
}

export function useCompanionWorkspaceSync() {
  const [state, setState] = useState<NativeCompanionWorkspaceSyncState>(EMPTY_SYNC_STATE);
  const [readableArticle, setReadableArticle] = useState<CompanionReadableArticle | null>(null);
  const [status, setStatus] = useState<CompanionWorkspaceSyncStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useWorkspaceSyncBootstrap(setError, setReadableArticle, setState, setStatus);
  useForegroundAutoSync(setError, setReadableArticle, setState, setStatus, state, tryForegroundAutoSync);

  async function saveEndpoint(endpointUrl: string) {
    const nextState = await saveCompanionWorkspaceSyncEndpoint(endpointUrl);
    setState(nextState);
    return nextState;
  }

  async function pullFromDesktop(endpointUrl: string) {
    setStatus('syncing');
    setError(null);
    try {
      const nextState = await pullCompanionWorkspaceSnapshot(endpointUrl);
      setState(nextState);
      setReadableArticle(await loadCompanionReadableArticle(nextState.workspace_snapshot));
      setStatus('idle');
      return nextState;
    } catch (syncError) {
      setStatus('idle');
      setError(syncError instanceof Error ? syncError.message : 'Desktop sync failed.');
      throw syncError;
    }
  }

  function clearError() {
    setError(null);
  }

  return {
    clearError,
    error,
    pullFromDesktop,
    readableArticle,
    saveEndpoint,
    state,
    status
  };
}
