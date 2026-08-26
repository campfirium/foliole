import { useCallback } from 'react';

import type { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import type { useCompanionSyncGroupJoin } from './useCompanionSyncGroupJoin';
import {
  assertCompanionSyncParticipating,
  useCompanionSyncParticipation
} from './useCompanionSyncParticipation';

export function useCompanionWorkspaceParticipationActions(args: {
  join: ReturnType<typeof useCompanionSyncGroupJoin>;
  setError(error: string | null): void;
  snapshotActions: ReturnType<typeof createWorkspaceSnapshotActions>;
}) {
  const participation = useCompanionSyncParticipation();
  const requireParticipation = useCallback(() => {
    try {
      assertCompanionSyncParticipating(participation.participating);
    } catch (error) {
      args.setError('sync_participation_inactive');
      throw error;
    }
  }, [args, participation.participating]);
  const pullFromDevice = useCallback(async (endpointUrl: string) => {
    return args.snapshotActions.pullFromDesktop(endpointUrl);
  }, [args.snapshotActions]);
  const discover = useCallback(() => {
    requireParticipation();
    return args.join.discover();
  }, [args.join, requireParticipation]);
  const completeJoin = useCallback(() => {
    requireParticipation();
    return args.join.complete();
  }, [args.join, requireParticipation]);
  const requestJoin = useCallback((endpointUrl: string) => {
    requireParticipation();
    return args.join.request(endpointUrl);
  }, [args.join, requireParticipation]);
  return { completeJoin, discover, participation, pullFromDevice, requestJoin };
}
