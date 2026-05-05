import { useEffect, useState } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionPairingState } from '../../lib/platform/nativeCompanionSyncContract';
import {
  loadCompanionDiscovery,
  loadCompanionPairingState,
  pairCompanionWithDesktop,
  requestCompanionPairing
} from '../shared/platform/companionWorkspaceSync';

export type CompanionPairingStatus =
  | 'idle'
  | 'checking-desktop'
  | 'requesting-pair'
  | 'awaiting-approval'
  | 'completing-pair';

export type CompanionDesktopDiscovery = {
  desktopName: string;
  endpointUrl: string;
  peerId: string;
} | null;

export type PendingPairRequest = {
  endpointUrl: string;
  expiresAt: string;
  pairRequestId: string;
} | null;

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

function createCompanionDeviceName(bootstrapState: NativeCompanionBootstrapState) {
  const runtimeLabel = bootstrapState.runtime_kind === 'android-capacitor' ? 'Android companion' : 'Web preview companion';
  return `${runtimeLabel} ${bootstrapState.device_id.slice(0, 8)}`;
}

function normalizeDiscovery(endpointUrl: string, discovery: { desktop_name: string; peer_id: string }) {
  return {
    desktopName: discovery.desktop_name,
    endpointUrl: endpointUrl.trim(),
    peerId: discovery.peer_id
  };
}

function useStoredPairingStateLoader(args: {
  onError: PairingHookArgs['onError'];
  setPairingState: (state: NativeCompanionPairingState) => void;
}) {
  useEffect(() => {
    let cancelled = false;
    void loadCompanionPairingState()
      .then((nextPairingState) => {
        if (!cancelled) {
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
  }, [args]);
}

function usePairingActions(
  args: PairingHookArgs & {
    setDesktopDiscovery: (value: CompanionDesktopDiscovery) => void;
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
  setDesktopDiscovery: (value: CompanionDesktopDiscovery) => void;
  setPairingStatus: (status: CompanionPairingStatus) => void;
}) {
  return async (endpointUrl: string) => {
    args.setPairingStatus('checking-desktop');
    args.onError(null);
    try {
      const discovery = await loadCompanionDiscovery(endpointUrl);
      args.setDesktopDiscovery(normalizeDiscovery(endpointUrl, discovery));
      args.setPairingStatus('idle');
      return discovery;
    } catch (error) {
      args.setPairingStatus('idle');
      args.onError(error instanceof Error ? error.message : 'Desktop discovery failed.');
      throw error;
    }
  };
}

function createRequestPairingAction(
  args: PairingHookArgs & {
    setDesktopDiscovery: (value: CompanionDesktopDiscovery) => void;
    setPairingStatus: (status: CompanionPairingStatus) => void;
    setPendingPairRequest: (value: PendingPairRequest) => void;
  }
) {
  return async (endpointUrl: string) => {
    args.setPairingStatus('requesting-pair');
    args.onError(null);
    try {
      const discovery = await loadCompanionDiscovery(endpointUrl);
      const nextRequest = await requestCompanionPairing({
        deviceId: args.bootstrapState.device_id,
        deviceKind: args.bootstrapState.runtime_kind,
        deviceName: createCompanionDeviceName(args.bootstrapState),
        endpointUrl
      });
      const normalizedDiscovery = normalizeDiscovery(endpointUrl, discovery);
      args.setDesktopDiscovery(normalizedDiscovery);
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

function createCompletePairingAction(
  args: PairingHookArgs & {
    setPairingState: (state: NativeCompanionPairingState) => void;
    setPairingStatus: (status: CompanionPairingStatus) => void;
    setPendingPairRequest: (value: PendingPairRequest) => void;
  }
) {
  return async (pendingPairRequest: PendingPairRequest) => {
    if (!pendingPairRequest) {
      return null;
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
      const message = error instanceof Error ? error.message : 'Failed to complete desktop pairing.';
      args.setPairingStatus(message.includes('409') ? 'awaiting-approval' : 'idle');
      args.onError(message);
      throw error;
    }
  };
}

export function useCompanionWorkspacePairing(args: PairingHookArgs) {
  const [pairingState, setPairingState] = useState<NativeCompanionPairingState>(EMPTY_PAIRING_STATE);
  const [desktopDiscovery, setDesktopDiscovery] = useState<CompanionDesktopDiscovery>(null);
  const [pendingPairRequest, setPendingPairRequest] = useState<PendingPairRequest>(null);
  const [pairingStatus, setPairingStatus] = useState<CompanionPairingStatus>('idle');
  useStoredPairingStateLoader({ onError: args.onError, setPairingState });
  const actions = usePairingActions({
    ...args,
    setDesktopDiscovery,
    setPairingState,
    setPairingStatus,
    setPendingPairRequest
  });

  return {
    desktopDiscovery,
    pairingState,
    pairingStatus,
    pendingPairRequest,
    checkDesktop: actions.checkDesktop,
    completePairing: () => actions.completePairing(pendingPairRequest),
    requestPairing: actions.requestPairing
  };
}
