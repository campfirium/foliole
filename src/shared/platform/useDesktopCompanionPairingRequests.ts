import { useCallback, useEffect, useMemo, useState } from 'react';

import type { DesktopCompanionPairingOverviewPayload } from '../../../lib/platform/nativeCompanionSyncContract';

import {
  disableDesktopCompanionSync,
  enableDesktopCompanionSync,
  approveDesktopCompanionPairRequest,
  clearDesktopCompanionPairedDevices,
  loadDesktopCompanionPairingOverview,
  rejectDesktopCompanionPairRequest
} from './desktopCompanionPairingBridge';
import { isDesktopRuntime } from './runtime';

const EMPTY_OVERVIEW: DesktopCompanionPairingOverviewPayload = {
  pending_requests: [],
  server_status: {
    advertised_urls: [],
    last_error: null,
    paired_device_count: 0,
    pending_pair_request_count: 0,
    port: null,
    state: 'stopped'
  },
  sync_enabled: false
};

function useDesktopCompanionPairingOverviewState() {
  const [overview, setOverview] = useState<DesktopCompanionPairingOverviewPayload>(EMPTY_OVERVIEW);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  return { error, isLoading, overview, pendingActionId, setError, setIsLoading, setOverview, setPendingActionId };
}

function useCompanionPairingRefresh(
  setOverview: (value: DesktopCompanionPairingOverviewPayload) => void,
  setError: (value: string | null) => void,
  setIsLoading: (value: boolean) => void
) {
  return useCallback(async () => {
    if (!isDesktopRuntime()) {
      setOverview(EMPTY_OVERVIEW);
      setIsLoading(false);
      setError(null);
      return EMPTY_OVERVIEW;
    }
    const nextOverview = await loadDesktopCompanionPairingOverview();
    setOverview(nextOverview);
    setError(null);
    setIsLoading(false);
    return nextOverview;
  }, [setError, setIsLoading, setOverview]);
}

function useCompanionPairingPolling(
  pollMs: number,
  setOverview: (value: DesktopCompanionPairingOverviewPayload) => void,
  setError: (value: string | null) => void,
  setIsLoading: (value: boolean) => void
) {
  useEffect(() => {
    let cancelled = false;
    const safeRefresh = async () => {
      try {
        const nextOverview = await loadDesktopCompanionPairingOverview();
        if (cancelled) {
          return;
        }
        setOverview(nextOverview);
        setError(null);
      } catch (loadError) {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Failed to load companion pairing requests.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void safeRefresh();
    if (!isDesktopRuntime()) {
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      void safeRefresh();
    }, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pollMs, setError, setIsLoading, setOverview]);
}

function useCompanionPairingAction(
  setOverview: (value: DesktopCompanionPairingOverviewPayload) => void,
  setError: (value: string | null) => void,
  setIsLoading: (value: boolean) => void,
  setPendingActionId: (value: string | null) => void
) {
  return useCallback(async (pairRequestId: string, action: 'approve' | 'reject') => {
    setPendingActionId(pairRequestId);
    try {
      const nextOverview =
        action === 'approve'
          ? await approveDesktopCompanionPairRequest(pairRequestId)
          : await rejectDesktopCompanionPairRequest(pairRequestId);
      setOverview(nextOverview);
      setError(null);
      return nextOverview;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to update companion pairing request.');
      throw actionError;
    } finally {
      setPendingActionId(null);
      setIsLoading(false);
    }
  }, [setError, setIsLoading, setOverview, setPendingActionId]);
}

function useClearPairedDevicesAction(
  setOverview: (value: DesktopCompanionPairingOverviewPayload) => void,
  setError: (value: string | null) => void,
  setIsLoading: (value: boolean) => void,
  setPendingActionId: (value: string | null) => void
) {
  return useCallback(async () => {
    setPendingActionId('clear-paired-devices');
    try {
      const nextOverview = await clearDesktopCompanionPairedDevices();
      setOverview(nextOverview);
      setError(null);
      return nextOverview;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to clear paired companion devices.');
      throw actionError;
    } finally {
      setPendingActionId(null);
      setIsLoading(false);
    }
  }, [setError, setIsLoading, setOverview, setPendingActionId]);
}

function useToggleCompanionSyncAction(
  setOverview: (value: DesktopCompanionPairingOverviewPayload) => void,
  setError: (value: string | null) => void,
  setIsLoading: (value: boolean) => void,
  setPendingActionId: (value: string | null) => void
) {
  return useCallback(async (enabled: boolean) => {
    setPendingActionId(enabled ? 'enable-sync' : 'disable-sync');
    try {
      const nextOverview = enabled ? await enableDesktopCompanionSync() : await disableDesktopCompanionSync();
      setOverview(nextOverview);
      setError(null);
      return nextOverview;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to update device sync availability.');
      throw actionError;
    } finally {
      setPendingActionId(null);
      setIsLoading(false);
    }
  }, [setError, setIsLoading, setOverview, setPendingActionId]);
}

export function useDesktopCompanionPairingRequests(pollMs = 2_000) {
  const state = useDesktopCompanionPairingOverviewState();
  const refresh = useCompanionPairingRefresh(state.setOverview, state.setError, state.setIsLoading);
  const runAction = useCompanionPairingAction(
    state.setOverview,
    state.setError,
    state.setIsLoading,
    state.setPendingActionId
  );
  const clearPairedDevices = useClearPairedDevicesAction(
    state.setOverview,
    state.setError,
    state.setIsLoading,
    state.setPendingActionId
  );
  const toggleSync = useToggleCompanionSyncAction(
    state.setOverview,
    state.setError,
    state.setIsLoading,
    state.setPendingActionId
  );
  useCompanionPairingPolling(pollMs, state.setOverview, state.setError, state.setIsLoading);

  return useMemo(
    () => ({
      approveRequest: (pairRequestId: string) => runAction(pairRequestId, 'approve'),
      clearPairedDevices,
      disableSync: () => toggleSync(false),
      enableSync: () => toggleSync(true),
      error: state.error,
      isDesktopRuntime: isDesktopRuntime(),
      isLoading: state.isLoading,
      overview: state.overview,
      pendingActionId: state.pendingActionId,
      refresh,
      rejectRequest: (pairRequestId: string) => runAction(pairRequestId, 'reject')
    }),
    [clearPairedDevices, refresh, runAction, state.error, state.isLoading, state.overview, state.pendingActionId, toggleSync]
  );
}
