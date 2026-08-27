import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import { useTranslation, type Translate } from '../shared/localization/LocalizationProvider';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import { isNativeCompanionSyncParticipationRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import type { CompanionHandoffReminderSettings } from './companionHandoffReminderSettings';
import { CompanionHandoffReminderSettingsPanel } from './CompanionHandoffReminderSettingsPanel';
import type { CompanionManualSyncAction } from './companionManualSyncAction';
import { CompanionSyncDiscoveryDialog } from './CompanionSyncDiscoveryDialog';
import type { CompanionSyncGroupDiscovery, PendingSyncGroupJoinRequest } from './companionSyncGroupJoinModel';
import { CompanionSyncNowButton } from './CompanionSyncNowButton';
import { CompanionSyncParticipationControls } from './CompanionSyncParticipationControls';
import { AwaitingApprovalState, EmptyDiscoveryState } from './CompanionSyncSetupStates';
import { CompanionSyncStatusDetails } from './CompanionSyncStatusDetails';
import type { CompanionSyncGroupJoinStatus } from './useCompanionSyncGroupJoin';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

type CompanionSyncPanelProps = {
  bootstrapState: NativeCompanionBootstrapState;
  discoveries: CompanionSyncGroupDiscovery[];
  endpointUrl: string | null;
  error: string | null;
  handoffReminderSettings: CompanionHandoffReminderSettings;
  joinRequest: PendingSyncGroupJoinRequest | null;
  joinStatus: CompanionSyncGroupJoinStatus;
  lastSyncedAt: string | null;
  manualSyncAction?: CompanionManualSyncAction | null;
  rememberedTargets: string[];
  syncConflictCount: number;
  syncEvents: NativeCompanionSyncEvent[];
  syncProgress: CompanionDesktopSyncProgress | null;
  syncGroup: SyncGroupPayload | null;
  onCancelJoin(): void;
  onChangeHandoffReminderSettings(settings: CompanionHandoffReminderSettings): void;
  onClearError(): void;
  onDiscover(): Promise<unknown>;
  onLeaveSyncGroup(): Promise<unknown>;
  onPull(endpointUrl: string): Promise<unknown>;
  onRemoveRememberedTarget(endpointUrl: string): Promise<unknown>;
  onRequestJoin(endpointUrl: string): Promise<unknown>;
  onSaveEndpoint(endpointUrl: string): Promise<unknown>;
  onOpenSettingsPage(page: CompanionSettingsPage): void;
  page: CompanionSettingsPage;
  status: 'idle' | 'loading' | 'syncing';
};

const EMULATOR_DEFAULT_ENDPOINT = 'http://10.0.2.2:38641';

function formatSyncPanelError(message: string, t: Translate) {
  if (message === 'discovery_permission_required') return t('companion.sync.discovery.permissionRequired');
  if (message === 'discovery_unavailable') return t('companion.sync.discovery.unavailable');
  if (message === 'discovery_incompatible') return t('companion.sync.discovery.incompatible');
  if (message === 'discovery_connection_failed') return t('companion.sync.discovery.connectionFailed');
  if (message.includes('sync_participation_inactive')) return t('companion.sync.participation.inactive');
  if (message.includes('sync_group_join_request_not_found')) return t('companion.sync.discovery.error.joinExpired');
  if (message.includes('sync_group_join_request_rejected')) return t('companion.sync.discovery.error.joinRejected');
  if (message.includes('protocol_incompatible')) return t('companion.sync.discovery.error.incompatible');
  return message;
}

function ConnectedContent(props: CompanionSyncPanelProps & { endpointUrl: string }) {
  if (!props.syncGroup || props.page === 'syncHandoff') return null;
  const syncAction = props.page === 'sync' ? (
    <CompanionSyncNowButton isSyncing={props.status === 'syncing'}
      manualSyncAction={props.manualSyncAction ?? null}
      onSync={() => void props.onPull(props.endpointUrl)} />
  ) : null;
  return (
    <>
      {syncAction}
      {props.page === 'sync' && isNativeCompanionSyncParticipationRuntime()
        ? <CompanionSyncParticipationControls /> : null}
      <CompanionSyncStatusDetails endpointUrl={props.endpointUrl} lastSyncedAt={props.lastSyncedAt}
        onOpenPage={props.onOpenSettingsPage} page={props.page} status={props.status}
        syncConflictCount={props.syncConflictCount} syncEvents={props.syncEvents}
        syncGroup={props.syncGroup} syncProgress={props.syncProgress} />
    </>
  );
}

export function CompanionSyncPanel(props: CompanionSyncPanelProps) {
  const t = useTranslation();
  const endpointUrl = props.joinRequest?.endpointUrl ?? props.discoveries[0]?.endpointUrl
    ?? props.endpointUrl ?? EMULATOR_DEFAULT_ENDPOINT;
  const busy = props.joinStatus === 'requesting';
  const searching = props.joinStatus === 'discovering' || props.discoveries.length > 0;
  return (
    <section className="mb-8 px-5 py-3">
      <div className="flex flex-col gap-5">
        {!props.syncGroup && isNativeCompanionSyncParticipationRuntime()
          ? <CompanionSyncParticipationControls /> : null}
        {props.syncGroup ? <ConnectedContent {...props} endpointUrl={endpointUrl} />
          : props.joinRequest
            ? <AwaitingApprovalState expiresAt={props.joinRequest.expiresAt} onCancel={props.onCancelJoin} />
            : searching ? null : <EmptyDiscoveryState disabled={busy} onTryAgain={() => void props.onDiscover()} />}
        {props.error ? <p className="text-sm text-error" data-error-code={props.error}
          data-testid="companion-sync-error">{formatSyncPanelError(props.error, t)}</p> : null}
        {props.syncGroup && (props.page === 'sync' || props.page === 'syncHandoff') ? (
          <CompanionHandoffReminderSettingsPanel page={props.page} settings={props.handoffReminderSettings}
            onChange={props.onChangeHandoffReminderSettings} onOpenPage={props.onOpenSettingsPage} />
        ) : null}
        <CompanionSyncDiscoveryDialog devices={props.syncGroup || props.joinRequest ? [] : props.discoveries}
          disabled={busy} isConnecting={busy} isSearching={!props.syncGroup && !props.joinRequest && searching}
          onJoin={(url) => void props.onRequestJoin(url).catch(() => undefined)}
          onRefresh={() => void props.onDiscover()} />
      </div>
    </section>
  );
}
