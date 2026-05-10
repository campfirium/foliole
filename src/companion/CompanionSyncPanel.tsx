import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionPairingState, NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';
import type { CompanionDesktopSyncProgress } from '../shared/platform/companionDesktopSyncObjects';

import type { CompanionHandoffReminderSettings } from './companionHandoffReminderSettings';
import { CompanionHandoffReminderSettingsPanel } from './CompanionHandoffReminderSettingsPanel';
import { CompanionSyncDiscoveryDialog } from './CompanionSyncDiscoveryDialog';
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
  pairingStatus: 'idle' | 'checking-desktop' | 'requesting-pair' | 'awaiting-approval' | 'completing-pair';
  status: 'idle' | 'loading' | 'syncing';
};

const EMULATOR_DEFAULT_ENDPOINT = 'http://10.0.2.2:38641';

function resolveEndpoint(props: CompanionSyncPanelProps) {
  return props.pairingRequest?.endpointUrl ?? props.desktopDiscovery?.endpointUrl ?? props.endpointUrl ?? EMULATOR_DEFAULT_ENDPOINT;
}

function resolveDesktopDiscoveries(props: CompanionSyncPanelProps) {
  return props.desktopDiscoveries?.length ? props.desktopDiscoveries : props.desktopDiscovery ? [props.desktopDiscovery] : [];
}

function ConnectedState(props: Pick<CompanionSyncPanelProps, 'lastSyncedAt' | 'onOpenSettingsPage' | 'onRequestPrimaryDeviceTakeover' | 'page' | 'pairingState' | 'status' | 'syncConflictCount' | 'syncEvents' | 'syncProgress'> & {
  desktopDiscovery: CompanionDesktopDiscovery | null;
  endpointUrl: string;
  onSync(): void;
}) {
  return (
    <>
      <CompanionSyncStatusDetails
        endpointUrl={props.endpointUrl}
        desktopDiscovery={props.desktopDiscovery}
        lastSyncedAt={props.lastSyncedAt}
        onRequestPrimaryDeviceTakeover={props.onRequestPrimaryDeviceTakeover}
        pairingState={props.pairingState}
        status={props.status}
        syncConflictCount={props.syncConflictCount}
        syncEvents={props.syncEvents}
        syncProgress={props.syncProgress}
        page={props.page}
        onOpenPage={props.onOpenSettingsPage}
      />
      <button
        className="w-full rounded-2xl border border-border-strong bg-foreground px-4 py-3 text-sm font-semibold text-bg-panel transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
        disabled={props.status === 'syncing'}
        onClick={props.onSync}
        type="button"
      >
        {props.status === 'syncing' ? 'Syncing' : 'Sync'}
      </button>
    </>
  );
}

function MainSyncContent(props: Pick<CompanionSyncPanelProps, 'lastSyncedAt' | 'onCancelPairing' | 'onOpenSettingsPage' | 'onRequestPrimaryDeviceTakeover' | 'page' | 'pairingRequest' | 'pairingState' | 'status' | 'syncConflictCount' | 'syncEvents' | 'syncProgress'> & {
  desktopDiscovery: CompanionDesktopDiscovery | null;
  endpointUrl: string;
  isBusy: boolean;
  isDiscovering: boolean;
  onSync(): void;
  onTryAgain(): void;
}) {
  if (props.pairingState.is_paired) {
    return props.page === 'syncHandoff' ? null : (
      <ConnectedState
        desktopDiscovery={props.desktopDiscovery}
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
  const endpointUrl = resolveEndpoint(props);
  const isBusy = props.pairingStatus !== 'idle' && props.pairingStatus !== 'awaiting-approval';
  const desktopDiscoveries = resolveDesktopDiscoveries(props);
  const hasPairing = props.pairingState.is_paired;
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

  return (
    <section className="mb-8 px-5 py-5">
      <div className="flex flex-col gap-5">
        <MainSyncContent
          {...props}
          desktopDiscovery={props.desktopDiscovery}
          endpointUrl={endpointUrl}
          isBusy={isBusy}
          isDiscovering={isDiscovering}
          onSync={() => void handleSync()}
          onTryAgain={() => void handleTryAgain()}
        />
        {props.error ? <p className="text-sm text-error">{props.error}</p> : null}
        {hasPairing && (props.page === 'sync' || props.page === 'syncHandoff') ? (
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
