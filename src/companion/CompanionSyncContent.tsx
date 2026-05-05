import { useEffect } from 'react';

import { CompanionSyncPanel } from './CompanionSyncPanel';
import { useCompanionHandoffReminderScheduler } from './useCompanionHandoffReminderScheduler';
import { useCompanionHandoffReminderSettings } from './useCompanionHandoffReminderSettings';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const PAIRING_APPROVAL_POLL_MS = 1_500;

function buildSyncPanelProps(args: {
  handoffReminders: ReturnType<typeof useCompanionHandoffReminderSettings>;
  onOpenSettingsPage?: (page: CompanionSettingsPage) => void;
  page: CompanionSettingsPage;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  const { handoffReminders, workspaceSync } = args;
  return {
    bootstrapState: workspaceSync.bootstrapState,
    desktopDiscoveries: workspaceSync.desktopDiscoveries ?? [],
    desktopDiscovery: workspaceSync.desktopDiscovery,
    endpointUrl: workspaceSync.state.endpoint_url,
    error: workspaceSync.error,
    handoffReminderSettings: handoffReminders.settings,
    lastSyncedAt: workspaceSync.state.last_synced_at,
    rememberedTargets: workspaceSync.state.remembered_targets,
    syncConflictCount: workspaceSync.syncConflictCount,
    syncEvents: workspaceSync.state.sync_events,
    syncProgress: workspaceSync.syncProgress,
    onCancelPairing: workspaceSync.cancelPairing,
    onChangeHandoffReminderSettings: handoffReminders.updateSettings,
    onCheckDesktop: workspaceSync.checkDesktop,
    onClearError: workspaceSync.clearError,
    onCompletePairing: workspaceSync.completePairing,
    onOpenSettingsPage: args.onOpenSettingsPage ?? (() => undefined),
    onPull: workspaceSync.pullFromDesktop,
    onRemoveRememberedTarget: workspaceSync.removeRememberedTarget,
    onRequestPairing: workspaceSync.requestPairing,
    onSaveEndpoint: workspaceSync.saveEndpoint,
    page: args.page,
    pairingRequest: workspaceSync.pendingPairRequest,
    pairingState: workspaceSync.pairingState,
    pairingStatus: workspaceSync.pairingStatus,
    status: workspaceSync.status
  };
}

export function CompanionSyncContent(props: {
  page?: CompanionSettingsPage;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
  onOpenSettingsPage?: (page: CompanionSettingsPage) => void;
}) {
  const { workspaceSync } = props;
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
    <CompanionSyncPanel {...buildSyncPanelProps({
      handoffReminders,
      onOpenSettingsPage: props.onOpenSettingsPage,
      page: props.page ?? 'sync',
      workspaceSync
    })} />
  );
}
