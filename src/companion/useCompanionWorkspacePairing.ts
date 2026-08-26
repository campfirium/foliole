import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionPairingState } from '../../lib/platform/nativeCompanionSyncContract';
import { startCompanionSyncGroupDiscoverySession } from '../shared/platform/companion/syncGroupDiscoverySession';
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

function mapDiscoveryCandidates(snapshot: Parameters<Parameters<typeof startCompanionSyncGroupDiscoverySession>[0]>[0]) {
  return snapshot.candidates.map((candidate) => ({
    appVersion: '',
    compatibility: { missing_capabilities: [], negotiated_version: null, reason: null, status: 'compatible' as const },
    desktopHostName: candidate.provider_host_name,
    desktopName: candidate.group_display_name,
    desktopPlatform: candidate.provider_host_platform,
    endpointUrl: candidate.endpoint_url,
    groupDisplayName: candidate.group_display_name,
    groupId: candidate.group_id,
    groupTag: candidate.group_tag,
    peerId: candidate.provider_authorization_id,
    timelineId: candidate.timeline_id
  }));
}

function useCompanionDiscovery(args: {
  isPaired: boolean;
  onError: PairingHookArgs['onError'];
  setDiscoveries(value: CompanionDesktopDiscovery[]): void;
  setStatus(value: CompanionPairingStatus): void;
}) {
  const stopRef = useRef<null | (() => Promise<void>)>(null);
  const stop = useCallback(async () => {
    const current = stopRef.current;
    stopRef.current = null;
    await current?.();
  }, []);
  const check = useCallback(async (endpointUrl?: string) => {
    void endpointUrl;
    await stop();
    args.setStatus('checking-desktop');
    args.onError(null);
    stopRef.current = await startCompanionSyncGroupDiscoverySession((snapshot) => {
      args.setDiscoveries(mapDiscoveryCandidates(snapshot));
      const error = ['permission_required', 'unavailable', 'incompatible', 'connection_failed'].includes(snapshot.status)
        ? `discovery_${snapshot.status}` : null;
      args.onError(error);
      args.setStatus(['stopped', 'permission_required', 'unavailable', 'incompatible', 'connection_failed']
        .includes(snapshot.status) ? 'idle' : 'checking-desktop');
    });
  }, [args, stop]);
  useEffect(() => () => { void stopRef.current?.(); }, []);
  useEffect(() => { if (args.isPaired) void stop(); }, [args.isPaired, stop]);
  return { check, stop };
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
  const discovery = useCompanionDiscovery({
    isPaired: pairingState.is_paired, onError: args.onError,
    setDiscoveries: setDesktopDiscoveries, setStatus: setPairingStatus
  });
  return {
    desktopDiscovery: desktopDiscoveries.length > 0 ? desktopDiscoveries[0] : null,
    desktopDiscoveries,
    pairingState,
    pairingStatus,
    pendingPairRequest,
    checkDesktop: discovery.check,
    cancelPairing: createCancelPairingAction({ onError: args.onError, setPairingStatus, setPendingPairRequest }),
    completePairing: createCompletePairingOnceAction({
      completePairing: actions.completePairing,
      inFlightRef: completePairingInFlightRef,
      pendingPairRequest
    }),
    requestPairing: async (endpointUrl: string) => {
      await discovery.stop();
      return actions.requestPairing(endpointUrl);
    },
    refreshPairingState
  };
}
