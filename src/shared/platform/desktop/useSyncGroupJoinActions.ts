import { useCallback } from 'react';

import type { DesktopSyncGroupOverviewPayload } from '../../../../lib/platform/nativeCompanionSyncContract';
import {
  completeDesktopSyncGroupJoin,
  discoverDesktopSyncGroups,
  onDesktopSyncGroupDiscoveryChanged,
  requestDesktopSyncGroupJoin,
  stopDiscoveringDesktopSyncGroups
} from '../desktopSyncGroupRuntimeRepository';

const JOIN_ACCEPTANCE_POLL_MS = 1_000;

async function waitForJoinAcceptance(expiresAt: string) {
  const deadline = new Date(expiresAt).getTime();
  let lastError: unknown = new Error('sync_group_join_request_expired');
  while (Date.now() < deadline) {
    try { return await completeDesktopSyncGroupJoin(); }
    catch (error) { lastError = error; }
    await new Promise((resolve) => window.setTimeout(resolve, JOIN_ACCEPTANCE_POLL_MS));
  }
  throw lastError;
}

export function useDesktopSyncGroupJoinActions(args: {
  setError(value: string | null): void;
  setIsLoading(value: boolean): void;
  setOverview(value: DesktopSyncGroupOverviewPayload): void;
  setPendingActionId(value: string | null): void;
}) {
  const { setError, setIsLoading, setOverview, setPendingActionId } = args;
  const run = useCallback(async (id: string, action: () => Promise<DesktopSyncGroupOverviewPayload>) => {
    setPendingActionId(id);
    try {
      const overview = await action();
      setOverview(overview);
      setError(null);
      return overview;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to join Sync Group.');
      throw error;
    } finally {
      setPendingActionId(null);
      setIsLoading(false);
    }
  }, [setError, setIsLoading, setOverview, setPendingActionId]);
  return {
    completeJoin: () => run('complete-sync-group-join', completeDesktopSyncGroupJoin),
    discoverGroups: async () => {
      setPendingActionId('discover-sync-groups');
      try {
        const snapshot = await discoverDesktopSyncGroups();
        setError(null);
        return snapshot;
      } finally {
        setPendingActionId(null);
        setIsLoading(false);
      }
    },
    onDiscoveryChanged: onDesktopSyncGroupDiscoveryChanged,
    requestJoin: (endpointUrl: string) => run('request-sync-group-join', async () => {
      const overview = await requestDesktopSyncGroupJoin(endpointUrl);
      await stopDiscoveringDesktopSyncGroups();
      setOverview(overview);
      const expiresAt = overview.join_request?.expires_at;
      if (!expiresAt) throw new Error('sync_group_join_not_pending');
      return waitForJoinAcceptance(expiresAt);
    })
  };
}
