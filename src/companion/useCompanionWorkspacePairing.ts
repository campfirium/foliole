import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionPairingState } from '../../lib/platform/nativeCompanionSyncContract';
import { loadCompanionPairingState } from '../shared/platform/companionWorkspaceSync';

import { usePairingActions } from './companionWorkspacePairingActions';
import {
  type CompanionDesktopDiscovery,
  type PendingPairRequest
} from './companionWorkspacePairingModel';
import {
  createCancelPairingAction,
  createCompletePairingOnceAction
} from './companionWorkspacePairingSessionActions';
import { createPrimaryDeviceTakeoverAction } from './companionWorkspacePrimaryDeviceTakeoverAction';
export type { CompanionDesktopDiscovery } from './companionWorkspacePairingModel';

export type CompanionPairingStatus =
  | 'idle'
  | 'checking-desktop'
  | 'requesting-pair'
  | 'awaiting-approval';

type PairingHookArgs = {
  bootstrapState: NativeCompanionBootstrapState;
  onError: (message: string | null) => void;
  onSaveEndpoint: (endpointUrl: string) => Promise<unknown>;
};

const EMPTY_PAIRING_STATE: NativeCompanionPairingState = {
  device_id: null,
  device_kind: null,
  device_name: null,
  is_paired: false,
  paired_at: null,
  primary_device_id: null
};

function useStoredPairingStateLoader(args: {
  pairingMutationVersionRef: MutableRefObject<number>;
  onError: PairingHookArgs['onError'];
  setPairingState: (state: NativeCompanionPairingState) => void;
}) {
  useEffect(() => {
    let cancelled = false;
    const loadVersion = args.pairingMutationVersionRef.current;
    void loadCompanionPairingState()
      .then((nextPairingState) => {
        if (!cancelled && args.pairingMutationVersionRef.current === loadVersion) {
          args.setPairingState(nextPairingState);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          args.onError(error instanceof Error ? error.message : 'Failed to load pairing state.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [args.onError, args.pairingMutationVersionRef, args.setPairingState]);
}

export function useCompanionWorkspacePairing(args: PairingHookArgs) {
  const [pairingState, setPairingState] = useState<NativeCompanionPairingState>(EMPTY_PAIRING_STATE);
  const [desktopDiscoveries, setDesktopDiscoveries] = useState<CompanionDesktopDiscovery[]>([]);
  const [pendingPairRequest, setPendingPairRequest] = useState<PendingPairRequest>(null);
  const [pairingStatus, setPairingStatus] = useState<CompanionPairingStatus>('idle');
  const completePairingInFlightRef = useRef<Promise<NativeCompanionPairingState | null> | null>(null);
  const pairingMutationVersionRef = useRef(0);
  const pairingStateRef = useRef(pairingState);
  const commitPairingState = useCallback((state: NativeCompanionPairingState) => {
    pairingMutationVersionRef.current += 1;
    pairingStateRef.current = state;
    setPairingState(state);
  }, []);
  const hydratePairingState = useCallback((state: NativeCompanionPairingState) => {
    pairingStateRef.current = state;
    setPairingState(state);
  }, []);
  const refreshPairingState = useCallback(async () => {
    const nextPairingState = await loadCompanionPairingState();
    hydratePairingState(nextPairingState);
    return nextPairingState;
  }, [hydratePairingState]);
  useStoredPairingStateLoader({
    pairingMutationVersionRef,
    onError: args.onError,
    setPairingState: hydratePairingState
  });
  const actions = usePairingActions({
    ...args,
    desktopDiscoveries,
    getPairingState: () => pairingStateRef.current,
    setDesktopDiscoveries,
    setPairingState: commitPairingState,
    setPairingStatus,
    setPendingPairRequest
  });
  const requestPrimaryTakeover = createPrimaryDeviceTakeoverAction({
    commitPairingState,
    onError: args.onError
  });

  return {
    desktopDiscovery: desktopDiscoveries.length > 0 ? desktopDiscoveries[0] : null,
    desktopDiscoveries,
    pairingState,
    pairingStatus,
    pendingPairRequest,
    checkDesktop: actions.checkDesktop,
    cancelPairing: createCancelPairingAction({ onError: args.onError, setPairingStatus, setPendingPairRequest }),
    completePairing: createCompletePairingOnceAction({
      completePairing: actions.completePairing,
      inFlightRef: completePairingInFlightRef,
      pendingPairRequest
    }),
    requestPrimaryDeviceTakeover: requestPrimaryTakeover,
    requestPairing: actions.requestPairing,
    refreshPairingState
  };
}
