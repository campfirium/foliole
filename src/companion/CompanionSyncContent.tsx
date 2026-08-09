import { useEffect, useState } from 'react';

import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import { definedProps } from '../shared/lib/definedProps';
import { reconcileCompanionSyncGroupProvider } from '../shared/platform/companion/sync/syncGroupProvider';
import { loadCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupStore';

import { useCompanionHandoffReminderRuntime } from './CompanionHandoffReminderRuntime';
import { CompanionSyncPanel } from './CompanionSyncPanel';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

const PAIRING_APPROVAL_POLL_MS = 7_000;

function buildSyncPanelProps(args: {
  handoffReminders: ReturnType<typeof useCompanionHandoffReminderRuntime>;
  onOpenSettingsPage?: (page: CompanionSettingsPage) => void;
  page: CompanionSettingsPage;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
  syncGroup: SyncGroupPayload | null;
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
    syncGroup: args.syncGroup,
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
  const [syncGroup, setSyncGroup] = useState<SyncGroupPayload | null>(null);
  const [syncGroupLoaded, setSyncGroupLoaded] = useState(false);

  useEffect(() => {
    if (workspaceSync.bootstrapState.runtime_kind !== 'android-capacitor') return;
    setSyncGroupLoaded(false);
    void loadCompanionSyncGroup().then((group) => {
      setSyncGroup(group);
      setSyncGroupLoaded(true);
    }).catch(() => {
      setSyncGroup(null);
      setSyncGroupLoaded(true);
    });
  }, [workspaceSync.bootstrapState.runtime_kind, workspaceSync.pairingState.is_paired, workspaceSync.state.last_synced_at]);

  useEffect(() => {
    if (workspaceSync.bootstrapState.runtime_kind !== 'android-capacitor' || !syncGroupLoaded) return;
    void reconcileCompanionSyncGroupProvider(workspaceSync.bootstrapState, syncGroup).catch(() => undefined);
  }, [syncGroup, syncGroupLoaded, workspaceSync.bootstrapState]);

  useEffect(() => {
    if (!workspaceSync.pendingPairRequest || workspaceSync.pairingStatus !== 'awaiting-approval') {
      return;
    }

    const pairingEndpoint = workspaceSync.pendingPairRequest.endpointUrl;
    const completeApprovedPairing = () => {
      void workspaceSync.completePairing()
        .then((pairingState) => {
          if (pairingState?.sync_usable) {
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
      page: props.page ?? 'sync',
      syncGroup,
      workspaceSync,
      ...definedProps({ onOpenSettingsPage: props.onOpenSettingsPage })
    })} />
  );
}
