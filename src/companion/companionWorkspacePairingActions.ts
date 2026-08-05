import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionPairingState } from '../../lib/platform/nativeCompanionSyncContract';
import { CompanionPairingHttpError } from '../shared/platform/companionPairingHttpError';
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
import type { CompanionPairingStatus } from './useCompanionWorkspacePairing';

type PairingActionArgs = {
  bootstrapState: NativeCompanionBootstrapState;
  onError: (message: string | null) => void;
  onSaveEndpoint: (endpointUrl: string) => Promise<unknown>;
};

export function usePairingActions(
  args: PairingActionArgs & {
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
  onError: PairingActionArgs['onError'];
  setDesktopDiscoveries: (value: CompanionDesktopDiscovery[]) => void;
  setPairingStatus: (status: CompanionPairingStatus) => void;
}) {
  return async (endpointUrl: string) => {
    args.setPairingStatus('checking-desktop');
    args.onError(null);
    try {
      const discoveries = await discoverCompanionDesktops(endpointUrl);
      args.setDesktopDiscoveries(discoveries.map((result) => (
        normalizeDiscovery(result.endpointUrl, result.discovery, result.compatibility)
      )));
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
  args: PairingActionArgs & {
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
      if (normalizedDiscovery.compatibility.status === 'incompatible') {
        throw new Error('Update Foliole on both devices, then try pairing again.');
      }
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
        pairRequestId: nextRequest.pair_request_id,
        remotePeerId: normalizedDiscovery.peerId,
        remotePeerName: normalizedDiscovery.desktopDeviceName,
        remotePeerPlatform: normalizedDiscovery.desktopPlatform
      });
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
  const result = await discoverCompanionDesktop(endpointUrl);
  return normalizeDiscovery(result.endpointUrl, result.discovery, result.compatibility);
}

type CompletePairingActionArgs = PairingActionArgs & {
  getPairingState: () => NativeCompanionPairingState;
  setPairingState: (state: NativeCompanionPairingState) => void;
  setPairingStatus: (status: CompanionPairingStatus) => void;
  setPendingPairRequest: (value: PendingPairRequest) => void;
};

async function handleCompletePairingError(args: CompletePairingActionArgs, error: unknown) {
  const message = error instanceof Error ? error.message : 'Failed to complete desktop pairing.';
  const code = error instanceof CompanionPairingHttpError ? error.code : null;
  const isStillAwaitingApproval = code === 'pair_request_pending';
  const isExpired = code === 'pair_request_not_found';
  const isRejected = code === 'pair_request_rejected';
  const isProtocolIncompatible = code === 'protocol_incompatible';
  const storedPairingState = isExpired ? await loadCompanionPairingState().catch(() => null) : null;
  if (storedPairingState?.is_paired) {
    args.setPairingState(storedPairingState);
    args.setPendingPairRequest(null);
    args.setPairingStatus('idle');
    args.onError(null);
    return storedPairingState;
  }
  const shouldKeepWaiting = isStillAwaitingApproval;
  args.setPairingStatus(shouldKeepWaiting ? 'awaiting-approval' : 'idle');
  if (!shouldKeepWaiting) args.setPendingPairRequest(null);
  args.onError(
    isStillAwaitingApproval
      ? null
      : isExpired
        ? 'Pairing request expired. Tap Pair again.'
        : isRejected
          ? 'Pairing request was rejected.'
          : isProtocolIncompatible
            ? 'Update Foliole on both devices, then pair again.'
            : message
  );
  throw error;
}

function createCompletePairingAction(args: CompletePairingActionArgs) {
  return async (pendingPairRequest: PendingPairRequest) => {
    if (!pendingPairRequest) return null;
    const currentPairingState = args.getPairingState();
    if (currentPairingState.is_paired) {
      args.setPendingPairRequest(null);
      args.setPairingStatus('idle');
      args.onError(null);
      return currentPairingState;
    }
    args.onError(null);
    try {
      const nextPairingState = await pairCompanionWithDesktop({
        deviceKind: args.bootstrapState.runtime_kind,
        deviceName: createCompanionDeviceName(args.bootstrapState),
        endpointUrl: pendingPairRequest.endpointUrl,
        pairRequestId: pendingPairRequest.pairRequestId,
        remotePeerId: pendingPairRequest.remotePeerId,
        remotePeerName: pendingPairRequest.remotePeerName,
        remotePeerPlatform: pendingPairRequest.remotePeerPlatform
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
