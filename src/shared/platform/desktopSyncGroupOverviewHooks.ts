import { useCallback, useEffect } from 'react';

import type { DesktopSyncGroupOverviewPayload } from '../../../lib/platform/nativeCompanionSyncContract';

import { loadDesktopSyncGroupOverview, onDesktopSyncGroupJoinRequestsChanged } from './desktopSyncGroupRuntimeRepository';
import { isDesktopRuntime } from './runtime';

export const EMPTY_DESKTOP_SYNC_GROUP_OVERVIEW: DesktopSyncGroupOverviewPayload = {
  current_device: null,
  join_requests: [],
  server_status: {
    active_device_count: 0,
    advertised_urls: [],
    last_error: null,
    pending_join_request_count: 0,
    port: null,
    state: 'stopped'
  },
  sync_group: null,
  sync_enabled: false,
  sync_paused: false,
  participating: false
};

export function useSyncGroupOverviewRefresh(
  setOverview: (value: DesktopSyncGroupOverviewPayload) => void,
  setError: (value: string | null) => void,
  setIsLoading: (value: boolean) => void
) {
  return useCallback(async () => {
    if (!isDesktopRuntime()) {
      setOverview(EMPTY_DESKTOP_SYNC_GROUP_OVERVIEW);
      setIsLoading(false);
      setError(null);
      return EMPTY_DESKTOP_SYNC_GROUP_OVERVIEW;
    }
    const nextOverview = await loadDesktopSyncGroupOverview();
    setOverview(nextOverview);
    setError(null);
    setIsLoading(false);
    return nextOverview;
  }, [setError, setIsLoading, setOverview]);
}

export function useSyncGroupPushRefresh(refresh: () => Promise<DesktopSyncGroupOverviewPayload>) {
  useEffect(() => {
    if (!isDesktopRuntime()) {
      return undefined;
    }
    return onDesktopSyncGroupJoinRequestsChanged(() => {
      void refresh();
    }) ?? undefined;
  }, [refresh]);
}
