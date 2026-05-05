import { useEffect } from 'react';

import { CompanionSyncPanel } from './CompanionSyncPanel';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const DEFAULT_DISCOVERY_ENDPOINT = 'http://10.0.2.2:38641';
const INITIAL_DISCOVERY_DELAY_MS = 250;
const RETRY_DISCOVERY_DELAY_MS = 2_500;
const PAIRING_APPROVAL_POLL_MS = 1_500;

export function CompanionSyncContent(props: { workspaceSync: ReturnType<typeof useCompanionWorkspaceSync> }) {
  const { workspaceSync } = props;
  const discoveryEndpoint = workspaceSync.state.endpoint_url ?? DEFAULT_DISCOVERY_ENDPOINT;
  const desktopDiscoveries = workspaceSync.desktopDiscoveries ?? [];

  useEffect(() => {
    if (
      workspaceSync.pairingState.is_paired ||
      desktopDiscoveries.length > 0 ||
      workspaceSync.pendingPairRequest ||
      workspaceSync.pairingStatus !== 'idle'
    ) {
      return;
    }

    const retryDelay = workspaceSync.error ? RETRY_DISCOVERY_DELAY_MS : INITIAL_DISCOVERY_DELAY_MS;
    const retryId = window.setTimeout(() => {
      void workspaceSync.checkDesktop(discoveryEndpoint).catch(() => undefined);
    }, retryDelay);

    return () => window.clearTimeout(retryId);
  }, [
    discoveryEndpoint,
    desktopDiscoveries.length,
    workspaceSync.error,
    workspaceSync.pairingState.is_paired,
    workspaceSync.pairingStatus,
    workspaceSync.pendingPairRequest,
    workspaceSync.checkDesktop
  ]);


  useEffect(() => {
    if (!workspaceSync.pendingPairRequest || workspaceSync.pairingStatus !== 'awaiting-approval') {
      return;
    }

    const pairingEndpoint = workspaceSync.pendingPairRequest.endpointUrl;
    const completeApprovedPairing = () => {
      void workspaceSync.completePairing()
        .then((pairingState) => {
          if (pairingState?.is_paired) {
            return workspaceSync.pullFromDesktop(pairingEndpoint);
          }
          return null;
        })
        .catch(() => undefined);
    };
    completeApprovedPairing();
    const timer = window.setInterval(completeApprovedPairing, PAIRING_APPROVAL_POLL_MS);

    return () => window.clearInterval(timer);
  }, [
    workspaceSync.completePairing,
    workspaceSync.pairingStatus,
    workspaceSync.pendingPairRequest,
    workspaceSync.pullFromDesktop
  ]);

  return (
    <CompanionSyncPanel
      bootstrapState={workspaceSync.bootstrapState}
      desktopDiscoveries={desktopDiscoveries}
      desktopDiscovery={workspaceSync.desktopDiscovery}
      endpointUrl={workspaceSync.state.endpoint_url}
      error={workspaceSync.error}
      lastSyncedAt={workspaceSync.state.last_synced_at}
      rememberedTargets={workspaceSync.state.remembered_targets}
      onCancelPairing={workspaceSync.cancelPairing}
      onCheckDesktop={workspaceSync.checkDesktop}
      onClearError={workspaceSync.clearError}
      onCompletePairing={workspaceSync.completePairing}
      onPull={workspaceSync.pullFromDesktop}
      onRemoveRememberedTarget={workspaceSync.removeRememberedTarget}
      onRequestPairing={workspaceSync.requestPairing}
      onSaveEndpoint={workspaceSync.saveEndpoint}
      pairingRequest={workspaceSync.pendingPairRequest}
      pairingState={workspaceSync.pairingState}
      pairingStatus={workspaceSync.pairingStatus}
      status={workspaceSync.status}
    />
  );
}
