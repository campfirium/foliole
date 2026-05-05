import { useEffect } from 'react';

import { CompanionSyncPanel } from './CompanionSyncPanel';
import { useCompanionHandoffReminderScheduler } from './useCompanionHandoffReminderScheduler';
import { useCompanionHandoffReminderSettings } from './useCompanionHandoffReminderSettings';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const PAIRING_APPROVAL_POLL_MS = 1_500;

export function CompanionSyncContent(props: { workspaceSync: ReturnType<typeof useCompanionWorkspaceSync> }) {
  const { workspaceSync } = props;
  const desktopDiscoveries = workspaceSync.desktopDiscoveries ?? [];
  const handoffReminders = useCompanionHandoffReminderSettings();
  useCompanionHandoffReminderScheduler({ settings: handoffReminders.settings, workspaceSync });

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
      handoffReminderSettings={handoffReminders.settings}
      lastSyncedAt={workspaceSync.state.last_synced_at}
      rememberedTargets={workspaceSync.state.remembered_targets}
      syncEvents={workspaceSync.state.sync_events}
      onCancelPairing={workspaceSync.cancelPairing}
      onChangeHandoffReminderSettings={handoffReminders.updateSettings}
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
