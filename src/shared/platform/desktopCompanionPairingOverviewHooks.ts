import { useCallback, useEffect } from 'react';

import type { DesktopCompanionPairingOverviewPayload } from '../../../lib/platform/nativeCompanionSyncContract';

import { loadDesktopCompanionPairingOverview, onDesktopCompanionPairingRequestsChanged } from './desktopCompanionPairingRuntimeRepository';
import { isDesktopRuntime } from './runtime';

export const EMPTY_DESKTOP_COMPANION_PAIRING_OVERVIEW: DesktopCompanionPairingOverviewPayload = {
  paired_devices: [],
  pending_requests: [],
  primary_device_state: {
    can_initiate_takeover: false,
    local_role: 'unknown',
    primary_device_id: null,
    source: 'paired-primary-missing',
    takeover_blocked_reasons: ['no-current-primary-device']
  },
  server_status: {
    advertised_urls: [],
    last_error: null,
    paired_device_count: 0,
    pending_pair_request_count: 0,
    port: null,
    state: 'stopped'
  },
  sync_group: null,
  sync_enabled: false,
  sync_paused: false,
  participating: false
};

export function useCompanionPairingRefresh(
  setOverview: (value: DesktopCompanionPairingOverviewPayload) => void,
  setError: (value: string | null) => void,
  setIsLoading: (value: boolean) => void
) {
  return useCallback(async () => {
    if (!isDesktopRuntime()) {
      setOverview(EMPTY_DESKTOP_COMPANION_PAIRING_OVERVIEW);
      setIsLoading(false);
      setError(null);
      return EMPTY_DESKTOP_COMPANION_PAIRING_OVERVIEW;
    }
    const nextOverview = await loadDesktopCompanionPairingOverview();
    setOverview(nextOverview);
    setError(null);
    setIsLoading(false);
    return nextOverview;
  }, [setError, setIsLoading, setOverview]);
}

export function useCompanionPairingPolling(
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
        if (!cancelled) {
          setOverview(nextOverview);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load companion pairing requests.');
        }
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
      void safeRefresh();
    }, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pollMs, setError, setIsLoading, setOverview]);
}

export function useCompanionPairingPushRefresh(refresh: () => Promise<DesktopCompanionPairingOverviewPayload>) {
  useEffect(() => {
    if (!isDesktopRuntime()) {
      return undefined;
    }
    return onDesktopCompanionPairingRequestsChanged(() => {
      void refresh();
    }) ?? undefined;
  }, [refresh]);
}
