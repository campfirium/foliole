import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionPairingState } from '../../lib/platform/nativeCompanionSyncContract';
import {
  discoverCompanionDesktop,
  discoverCompanionDesktops,
  loadCompanionPairingState,
  pairCompanionWithDesktop,
  requestCompanionPairing
} from '../shared/platform/companionWorkspaceSync';

import {
  createCompanionDeviceName,
  type CompanionDesktopDiscovery,
  mergeSelectedDiscovery,
  normalizeDiscovery,
  type PendingPairRequest
} from './companionWorkspacePairingModel';
export type { CompanionDesktopDiscovery } from './companionWorkspacePairingModel';

export type CompanionPairingStatus =
  | 'idle'
  | 'checking-desktop'
  | 'requesting-pair'
  | 'awaiting-approval'
  | 'completing-pair';

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
  paired_at: null
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

function usePairingActions(
  args: PairingHookArgs & {
    desktopDiscoveries: CompanionDesktopDiscovery[];
    getPairingState: () => NativeCompanionPairingState;
    setDesktopDiscoveries: (value: CompanionDesktopDiscovery[]) => void;
    setPairingState: (state: NativeCompanionPairingState) => void;
    setPairingStatus: (status: CompanionPairingStatus) => void;
    setPendingPairRequest: (value: PendingPairRequest) => void;
  }
) {
  return {
    checkDesktop: createCheckDesktopAction(args),
    completePairing: createCompletePairingAction(args),
    requestPairing: createRequestPairingAction(args)
  };
}

function createCheckDesktopAction(args: {
  onError: PairingHookArgs['onError'];
  setDesktopDiscoveries: (value: CompanionDesktopDiscovery[]) => void;
  setPairingStatus: (status: CompanionPairingStatus) => void;
}) {
  return async (endpointUrl: string) => {
    args.setPairingStatus('checking-desktop');
    args.onError(null);
    try {
      const discoveries = await discoverCompanionDesktops(endpointUrl);
      const normalizedDiscoveries = discoveries.map((result) => normalizeDiscovery(result.endpointUrl, result.discovery));
      args.setDesktopDiscoveries(normalizedDiscoveries);
      args.setPairingStatus('idle');
      return discoveries;
    } catch (error) {
      args.setPairingStatus('idle');
      args.onError(error instanceof Error ? error.message : 'Desktop discovery failed.');
      throw error;
    }
  };
}

function createRequestPairingAction(
  args: PairingHookArgs & {
    desktopDiscoveries: CompanionDesktopDiscovery[];
    setDesktopDiscoveries: (value: CompanionDesktopDiscovery[]) => void;
    setPairingStatus: (status: CompanionPairingStatus) => void;
    setPendingPairRequest: (value: PendingPairRequest) => void;
  }
) {
  return async (endpointUrl: string) => {
    args.setPairingStatus('requesting-pair');
    args.onError(null);
    try {
      const selectedDiscovery = args.desktopDiscoveries.find((discovery) => discovery.endpointUrl === endpointUrl.trim());
      const normalizedDiscovery = selectedDiscovery ?? await discoverAndNormalizeDesktop(endpointUrl);
      const nextRequest = await requestCompanionPairing({
        deviceId: args.bootstrapState.device_id,
        deviceKind: args.bootstrapState.runtime_kind,
        deviceName: createCompanionDeviceName(args.bootstrapState),
        endpointUrl: normalizedDiscovery.endpointUrl
      });
      args.setDesktopDiscoveries(mergeSelectedDiscovery(args.desktopDiscoveries, normalizedDiscovery));
      args.setPendingPairRequest({
        endpointUrl: normalizedDiscovery.endpointUrl,
        expiresAt: nextRequest.expires_at,
        pairRequestId: nextRequest.pair_request_id
      });
      await args.onSaveEndpoint(normalizedDiscovery.endpointUrl);
      args.setPairingStatus('awaiting-approval');
      return nextRequest;
    } catch (error) {
      args.setPairingStatus('idle');
      args.onError(error instanceof Error ? error.message : 'Failed to request desktop pairing.');
      throw error;
    }
  };
}

async function discoverAndNormalizeDesktop(endpointUrl: string) {
  const { discovery, endpointUrl: discoveredEndpointUrl } = await discoverCompanionDesktop(endpointUrl);
  return normalizeDiscovery(discoveredEndpointUrl, discovery);
}

type CompletePairingActionArgs = PairingHookArgs & {
  getPairingState: () => NativeCompanionPairingState;
  setPairingState: (state: NativeCompanionPairingState) => void;
  setPairingStatus: (status: CompanionPairingStatus) => void;
  setPendingPairRequest: (value: PendingPairRequest) => void;
};

async function handleCompletePairingError(args: CompletePairingActionArgs, error: unknown) {
  const message = error instanceof Error ? error.message : 'Failed to complete desktop pairing.';
  const isStillAwaitingApproval = message.includes('409') || message.includes('pair_request_pending');
  const isExpired = message.includes('404') || message.includes('pair_request_not_found');
  const isRejected = message.includes('403') || message.includes('pair_request_rejected');
  const storedPairingState = isExpired ? await loadCompanionPairingState().catch(() => null) : null;
  if (storedPairingState?.is_paired) {
    args.setPairingState(storedPairingState);
    args.setPendingPairRequest(null);
    args.setPairingStatus('idle');
    args.onError(null);
    return storedPairingState;
  }
  const shouldKeepWaiting = isStillAwaitingApproval || (!isExpired && !isRejected);
  args.setPairingStatus(shouldKeepWaiting ? 'awaiting-approval' : 'idle');
  if (!shouldKeepWaiting) args.setPendingPairRequest(null);
  args.onError(
    isStillAwaitingApproval
      ? null
      : isExpired
        ? 'Pairing request expired. Tap Pair again.'
        : isRejected
          ? 'Pairing request was rejected.'
          : message
  );
  throw error;
}

function createCompletePairingAction(args: CompletePairingActionArgs) {
  return async (pendingPairRequest: PendingPairRequest) => {
    if (!pendingPairRequest) {
      return null;
    }
    const currentPairingState = args.getPairingState();
    if (currentPairingState.is_paired) {
      args.setPendingPairRequest(null);
      args.setPairingStatus('idle');
      args.onError(null);
      return currentPairingState;
    }
    args.setPairingStatus('completing-pair');
    args.onError(null);
    try {
      const nextPairingState = await pairCompanionWithDesktop({
        deviceKind: args.bootstrapState.runtime_kind,
        deviceName: createCompanionDeviceName(args.bootstrapState),
        endpointUrl: pendingPairRequest.endpointUrl,
        pairRequestId: pendingPairRequest.pairRequestId
      });
      args.setPairingState(nextPairingState);
      await args.onSaveEndpoint(pendingPairRequest.endpointUrl);
      args.setPendingPairRequest(null);
      args.setPairingStatus('idle');
      return nextPairingState;
    } catch (error) {
      return await handleCompletePairingError(args, error);
    }
  };
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

  return {
    desktopDiscovery: desktopDiscoveries.length > 0 ? desktopDiscoveries[0] : null,
    desktopDiscoveries,
    pairingState,
    pairingStatus,
    pendingPairRequest,
    checkDesktop: actions.checkDesktop,
    cancelPairing: () => {
      setPendingPairRequest(null);
      setPairingStatus('idle');
      args.onError(null);
    },
    completePairing: () => {
      if (completePairingInFlightRef.current) {
        return completePairingInFlightRef.current;
      }
      const completePairingPromise = actions.completePairing(pendingPairRequest)
        .finally(() => {
          completePairingInFlightRef.current = null;
        });
      completePairingInFlightRef.current = completePairingPromise;
      return completePairingPromise;
    },
    requestPairing: actions.requestPairing
  };
}
