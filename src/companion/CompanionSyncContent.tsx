import { definedProps } from '../shared/lib/definedProps';

import { useCompanionHandoffReminderRuntime } from './CompanionHandoffReminderRuntime';
import { CompanionSyncPanel } from './CompanionSyncPanel';
import { useCompanionPairingApprovalPolling } from './useCompanionPairingApprovalPolling';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const PAIRING_APPROVAL_POLL_MS = 7_000;

function buildSyncPanelProps(args: {
  handoffReminders: ReturnType<typeof useCompanionHandoffReminderRuntime>;
  onOpenSettingsPage?: (page: CompanionSettingsPage) => void;
  page: CompanionSettingsPage;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  const { handoffReminders, workspaceSync } = args;
  return {
    bootstrapState: workspaceSync.bootstrapState,
    desktopDiscoveries: workspaceSync.desktopDiscoveries ?? [],
    desktopDiscovery: workspaceSync.desktopDiscovery ?? null,
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
    onDisconnectPairing: workspaceSync.disconnectPairing,
    onOpenSettingsPage: args.onOpenSettingsPage ?? (() => undefined),
    onPull: workspaceSync.pullFromDesktop,
    onRemoveRememberedTarget: workspaceSync.removeRememberedTarget,
    onRequestPrimaryDeviceTakeover: workspaceSync.requestPrimaryDeviceTakeover,
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
  const handoffReminders = useCompanionHandoffReminderRuntime();
  useCompanionPairingApprovalPolling(workspaceSync, PAIRING_APPROVAL_POLL_MS);

  return (
    <CompanionSyncPanel {...buildSyncPanelProps({
      handoffReminders,
      page: props.page ?? 'sync',
      workspaceSync,
      ...definedProps({ onOpenSettingsPage: props.onOpenSettingsPage })
    })} />
  );
}
