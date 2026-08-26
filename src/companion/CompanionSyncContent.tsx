import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import { definedProps } from '../shared/lib/definedProps';

import { useCompanionHandoffReminderRuntime } from './CompanionHandoffReminderRuntime';
import { useCompanionSyncGroupRuntime } from './CompanionSyncGroupRuntime';
import { CompanionSyncPanel } from './CompanionSyncPanel';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

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
    discoveries: workspaceSync.syncGroupDiscoveries,
    endpointUrl: workspaceSync.state.endpoint_url,
    error: workspaceSync.error,
    handoffReminderSettings: handoffReminders.settings,
    joinRequest: workspaceSync.pendingJoinRequest,
    joinStatus: workspaceSync.joinStatus,
    lastSyncedAt: workspaceSync.state.last_synced_at,
    manualSyncAction: workspaceSync.manualSyncAction,
    rememberedTargets: workspaceSync.state.remembered_targets,
    syncConflictCount: workspaceSync.syncConflictCount,
    syncEvents: workspaceSync.state.sync_events,
    syncProgress: workspaceSync.syncProgress,
    syncGroup: args.syncGroup,
    onCancelJoin: workspaceSync.cancelJoin,
    onChangeHandoffReminderSettings: handoffReminders.updateSettings,
    onClearError: workspaceSync.clearError,
    onDiscover: workspaceSync.checkDesktop,
    onLeaveSyncGroup: workspaceSync.leaveSyncGroup,
    onOpenSettingsPage: args.onOpenSettingsPage ?? (() => undefined),
    onPull: workspaceSync.pullFromDesktop,
    onRemoveRememberedTarget: workspaceSync.removeRememberedTarget,
    onRequestJoin: workspaceSync.requestJoin,
    onSaveEndpoint: workspaceSync.saveEndpoint,
    page: args.page,
    status: workspaceSync.status
  };
}

export function CompanionSyncContent(props: {
  page?: CompanionSettingsPage;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
  onOpenSettingsPage?: (page: CompanionSettingsPage) => void;
}) {
  const handoffReminders = useCompanionHandoffReminderRuntime();
  const syncGroup = useCompanionSyncGroupRuntime();
  return (
    <CompanionSyncPanel {...buildSyncPanelProps({
      handoffReminders,
      page: props.page ?? 'sync',
      syncGroup,
      workspaceSync: props.workspaceSync,
      ...definedProps({ onOpenSettingsPage: props.onOpenSettingsPage })
    })} />
  );
}
