import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionPairingState, NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import { useTranslation, type Translate } from '../shared/localization/LocalizationProvider';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';
import { isCompanionPairingSyncUsable } from '../shared/platform/companionPairingState';

import type { CompanionHandoffReminderSettings } from './companionHandoffReminderSettings';
import { CompanionHandoffReminderSettingsPanel } from './CompanionHandoffReminderSettingsPanel';
import { CompanionSyncDiscoveryDialog } from './CompanionSyncDiscoveryDialog';
import { CompanionSyncRepairPairingState } from './CompanionSyncRepairPairingState';
import { AwaitingApprovalState, EmptyDiscoveryState } from './CompanionSyncSetupStates';
import { CompanionSyncStatusDetails } from './CompanionSyncStatusDetails';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import type { CompanionDesktopDiscovery } from './useCompanionWorkspacePairing';

type CompanionSyncPanelProps = {
  bootstrapState: NativeCompanionBootstrapState;
  desktopDiscoveries?: CompanionDesktopDiscovery[];
  desktopDiscovery: CompanionDesktopDiscovery | null;
  endpointUrl: string | null;
  error: string | null;
  handoffReminderSettings: CompanionHandoffReminderSettings;
  lastSyncedAt: string | null;
  rememberedTargets: string[];
  syncConflictCount: number;
  syncEvents: NativeCompanionSyncEvent[];
  syncProgress: CompanionDesktopSyncProgress | null;
  onCancelPairing(): void;
  onCheckDesktop(endpointUrl: string): Promise<unknown>;
  onChangeHandoffReminderSettings(settings: CompanionHandoffReminderSettings): void;
  onClearError(): void;
  onCompletePairing(): Promise<unknown>;
  onDisconnectPairing?: (() => Promise<unknown>) | undefined;
  onPull(endpointUrl: string): Promise<unknown>;
  onRemoveRememberedTarget(endpointUrl: string): Promise<unknown>;
  onRequestPrimaryDeviceTakeover(endpointUrl: string): Promise<unknown>;
  onRequestPairing(endpointUrl: string): Promise<unknown>;
  onSaveEndpoint(endpointUrl: string): Promise<unknown>;
  onOpenSettingsPage(page: CompanionSettingsPage): void;
  page: CompanionSettingsPage;
  pairingRequest: {
    endpointUrl: string;
    expiresAt: string;
    pairRequestId: string;
  } | null;
  pairingState: NativeCompanionPairingState;
  pairingStatus: 'idle' | 'checking-desktop' | 'requesting-pair' | 'awaiting-approval';
  status: 'idle' | 'loading' | 'syncing';
};

const EMULATOR_DEFAULT_ENDPOINT = 'http://10.0.2.2:38641';

function resolveEndpoint(props: CompanionSyncPanelProps) {
  return props.pairingRequest?.endpointUrl ?? props.desktopDiscovery?.endpointUrl ?? props.endpointUrl ?? EMULATOR_DEFAULT_ENDPOINT;
}

function resolveDesktopDiscoveries(props: CompanionSyncPanelProps) {
  return props.desktopDiscoveries?.length ? props.desktopDiscoveries : props.desktopDiscovery ? [props.desktopDiscovery] : [];
}

function formatSyncPanelError(message: string, t: Translate) {
  const lowerMessage = message.toLowerCase();
  const isPairingError = lowerMessage.includes('pair') || lowerMessage.includes('pairing');
  if (message.includes('pair_request_not_found') || message.includes('Pairing request expired') || (isPairingError && message.includes('404'))) {
    return t('companion.sync.discovery.error.pairingExpired');
  }
  if (message.includes('pair_request_rejected') || message.includes('Pairing request was rejected') || (isPairingError && message.includes('403'))) {
    return t('companion.sync.discovery.error.pairingRejected');
  }
  if (message.includes('protocol_incompatible') || message.includes('protocol_pairing_repair_required')) {
    return t('companion.sync.discovery.error.incompatible');
  }
  if (message.includes('pair_completion_rate_limited')) {
    return t('companion.sync.discovery.error.requestFailed');
  }
  if (message.includes('Desktop discovery failed') || message.includes('No desktop sync device found')) {
    return t('companion.sync.discovery.error.discoveryFailed');
  }
  if (message.includes('Failed to load pairing state')) return t('companion.sync.discovery.error.loadPairingFailed');
  if (message.includes('Failed to request desktop pairing')) return t('companion.sync.discovery.error.requestFailed');
  if (message.includes('Failed to set this device as primary')) return t('companion.sync.discovery.error.primaryFailed');
  if (message.includes('must sync to the latest desktop state')) return t('companion.sync.discovery.error.primaryNeedsSync');
  if (message.includes('diagnostics are required')) return t('companion.sync.discovery.error.primaryNeedsDiagnostics');
  if (message.includes('must be paired before becoming primary')) return t('companion.sync.discovery.error.primaryNeedsPairing');
  return message;
}

function ConnectedState(props: Pick<CompanionSyncPanelProps, 'lastSyncedAt' | 'onDisconnectPairing' | 'onOpenSettingsPage' | 'onRequestPrimaryDeviceTakeover' | 'page' | 'pairingState' | 'status' | 'syncConflictCount' | 'syncEvents' | 'syncProgress'> & {
  endpointUrl: string;
  onSync(): void;
}) {
  const t = useTranslation();
  const isPrimary = props.pairingState.device_id !== null && props.pairingState.primary_device_id === props.pairingState.device_id;
  return (
    <>
      <CompanionSyncStatusDetails
        endpointUrl={props.endpointUrl}
        lastSyncedAt={props.lastSyncedAt}
        pairingState={props.pairingState}
        status={props.status}
        syncConflictCount={props.syncConflictCount}
        syncEvents={props.syncEvents}
        syncProgress={props.syncProgress}
        page={props.page}
        onDisconnectPairing={props.onDisconnectPairing}
        onOpenPage={props.onOpenSettingsPage}
      />
      {props.page !== 'sync' ? null : (
        <>
          <button
            className="min-h-11 w-full rounded-xl border border-border-strong bg-foreground px-4 py-3 text-sm font-semibold text-bg-panel transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-companion-divider-strong disabled:text-companion-text-secondary"
            disabled={props.status === 'syncing'}
            onClick={props.onSync}
            type="button"
          >
            {props.status === 'syncing' ? t('companion.browse.syncing') : t('companion.settings.sync.title')}
          </button>
          {!isPrimary ? (
            <button
              className="min-h-11 w-full rounded-xl border border-companion-divider bg-companion-content px-4 py-3 text-sm font-semibold text-foreground transition active:bg-companion-subtle/80 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={props.status === 'syncing'}
              onClick={() => void props.onRequestPrimaryDeviceTakeover(props.endpointUrl)}
              type="button"
            >
              {t('companion.sync.setPrimary')}
            </button>
          ) : null}
        </>
      )}
    </>
  );
}

function MainSyncContent(props: Pick<CompanionSyncPanelProps, 'lastSyncedAt' | 'onCancelPairing' | 'onDisconnectPairing' | 'onOpenSettingsPage' | 'onRequestPrimaryDeviceTakeover' | 'page' | 'pairingRequest' | 'pairingState' | 'status' | 'syncConflictCount' | 'syncEvents' | 'syncProgress'> & {
  endpointUrl: string;
  isBusy: boolean;
  isDiscovering: boolean;
  onSync(): void;
  onTryAgain(): void;
}) {
  if (props.pairingState.is_paired && !isCompanionPairingSyncUsable(props.pairingState)) {
    return <CompanionSyncRepairPairingState onRepair={props.onDisconnectPairing} />;
  }
  if (isCompanionPairingSyncUsable(props.pairingState)) {
    return props.page === 'syncHandoff' ? null : (
      <ConnectedState
        endpointUrl={props.endpointUrl}
        lastSyncedAt={props.lastSyncedAt}
        pairingState={props.pairingState}
        status={props.status}
        syncConflictCount={props.syncConflictCount}
        syncEvents={props.syncEvents}
        syncProgress={props.syncProgress}
        page={props.page}
        onSync={props.onSync}
        onRequestPrimaryDeviceTakeover={props.onRequestPrimaryDeviceTakeover}
        onDisconnectPairing={props.onDisconnectPairing}
        onOpenSettingsPage={props.onOpenSettingsPage}
      />
    );
  }
  if (props.pairingRequest) {
    return <AwaitingApprovalState expiresAt={props.pairingRequest.expiresAt} onCancel={props.onCancelPairing} />;
  }
  return props.isDiscovering ? null : <EmptyDiscoveryState disabled={props.isBusy} onTryAgain={props.onTryAgain} />;
}

export function CompanionSyncPanel(props: CompanionSyncPanelProps) {
  const t = useTranslation();
  const endpointUrl = resolveEndpoint(props);
  const isBusy = props.pairingStatus !== 'idle' && props.pairingStatus !== 'awaiting-approval';
  const desktopDiscoveries = resolveDesktopDiscoveries(props);
  const hasPairing = props.pairingState.is_paired;
  const hasUsablePairing = isCompanionPairingSyncUsable(props.pairingState);
  const isDiscovering = props.pairingStatus === 'checking-desktop' || desktopDiscoveries.length > 0;

  async function handleTryAgain() {
    props.onClearError();
    await props.onCheckDesktop(endpointUrl);
  }

  async function handlePair(pairingEndpointUrl: string) {
    props.onClearError();
    await props.onRequestPairing(pairingEndpointUrl);
  }

  async function handleSync() {
    props.onClearError();
    await props.onPull(endpointUrl);
  }

  async function handleDisconnectPairing() {
    props.onClearError();
    await props.onDisconnectPairing?.();
  }

  return (
    <section className="mb-8 px-5 py-5">
      <div className="flex flex-col gap-5">
        <MainSyncContent
          {...props}
          endpointUrl={endpointUrl}
          isBusy={isBusy}
          isDiscovering={isDiscovering}
          onDisconnectPairing={handleDisconnectPairing}
          onSync={() => void handleSync()}
          onTryAgain={() => void handleTryAgain()}
        />
        {props.error ? <p className="text-sm text-error">{formatSyncPanelError(props.error, t)}</p> : null}
        {hasUsablePairing && (props.page === 'sync' || props.page === 'syncHandoff') ? (
          <CompanionHandoffReminderSettingsPanel
            page={props.page}
            settings={props.handoffReminderSettings}
            onChange={props.onChangeHandoffReminderSettings}
            onOpenPage={props.onOpenSettingsPage}
          />
        ) : null}
        <CompanionSyncDiscoveryDialog
          desktops={hasPairing || props.pairingRequest ? [] : desktopDiscoveries}
          disabled={props.pairingStatus === 'requesting-pair'}
          isConnecting={props.pairingStatus === 'requesting-pair'}
          isSearching={!hasPairing && !props.pairingRequest && props.pairingStatus === 'checking-desktop'}
          onPair={(pairingEndpointUrl) => void handlePair(pairingEndpointUrl)}
          onRefresh={() => void handleTryAgain()}
        />
      </div>
    </section>
  );
}
