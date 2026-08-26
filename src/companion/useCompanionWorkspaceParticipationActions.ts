import { useCallback } from 'react';

import type { createWorkspaceSnapshotActions } from './companionWorkspaceSyncActions';
import {
  assertCompanionSyncParticipating,
  useCompanionSyncParticipation
} from './useCompanionSyncParticipation';
import type { useCompanionWorkspacePairing } from './useCompanionWorkspacePairing';

export function useCompanionWorkspaceParticipationActions(args: {
  pairing: ReturnType<typeof useCompanionWorkspacePairing>;
  setError(error: string | null): void;
  snapshotActions: ReturnType<typeof createWorkspaceSnapshotActions>;
}) {
  const participation = useCompanionSyncParticipation();
  const requireParticipation = useCallback(() => {
    try {
      assertCompanionSyncParticipating(participation.participating);
    } catch (participationError) {
      args.setError('sync_participation_inactive');
      throw participationError;
    }
  }, [args, participation.participating]);
  const pullFromDesktop = useCallback(async (endpointUrl: string) => {
    const nextState = await args.snapshotActions.pullFromDesktop(endpointUrl);
    await args.pairing.refreshPairingState();
    return nextState;
  }, [args]);
  const checkDesktop = useCallback((endpointUrl: string) => {
    requireParticipation();
    return args.pairing.checkDesktop(endpointUrl);
  }, [args, requireParticipation]);
  const completePairing = useCallback(() => {
    requireParticipation();
    return args.pairing.completePairing();
  }, [args, requireParticipation]);
  const requestPairing = useCallback((endpointUrl: string) => {
    requireParticipation();
    return args.pairing.requestPairing(endpointUrl);
  }, [args, requireParticipation]);
  return { checkDesktop, completePairing, participation, pullFromDesktop, requestPairing };
}
