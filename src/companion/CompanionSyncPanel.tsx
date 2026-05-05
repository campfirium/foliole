import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionPairingState, NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';

import type { CompanionHandoffReminderSettings } from './companionHandoffReminderSettings';
import { CompanionHandoffReminderSettingsPanel } from './CompanionHandoffReminderSettingsPanel';
import { CompanionSyncDeviceList } from './CompanionSyncDeviceList';
import { CompanionSyncStatusDetails } from './CompanionSyncStatusDetails';
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
  syncEvents: NativeCompanionSyncEvent[];
  onCancelPairing(): void;
  onCheckDesktop(endpointUrl: string): Promise<unknown>;
  onChangeHandoffReminderSettings(settings: CompanionHandoffReminderSettings): void;
  onClearError(): void;
  onCompletePairing(): Promise<unknown>;
  onPull(endpointUrl: string): Promise<unknown>;
  onRemoveRememberedTarget(endpointUrl: string): Promise<unknown>;
  onRequestPairing(endpointUrl: string): Promise<unknown>;
  onSaveEndpoint(endpointUrl: string): Promise<unknown>;
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

function PrimaryAction(props: {
  children: string;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      className="w-full rounded-2xl border border-border-strong bg-foreground px-4 py-3 text-sm font-semibold text-bg-panel transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      {props.children}
    </button>
  );
}

function SyncStatusCard(props: {
  children?: React.ReactNode;
  detail?: React.ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-3xl border border-border bg-canvas px-5 py-5 text-foreground">
      <h3 className="text-lg font-semibold leading-tight">{props.title}</h3>
      {props.detail ? <div className="mt-3 text-sm leading-6 text-accent">{props.detail}</div> : null}
      {props.children ? <div className="mt-5">{props.children}</div> : null}
    </div>
  );
}

function ConnectedState(props: Pick<CompanionSyncPanelProps, 'lastSyncedAt' | 'pairingState' | 'status' | 'syncEvents'> & {
  endpointUrl: string;
  onSyncNow(): void;
}) {
  const isSyncing = props.status === 'syncing';
  return (
    <SyncStatusCard
      detail={isSyncing ? 'Sync is running now.' : 'This device is connected and ready to sync.'}
      title="Device sync"
    >
      <CompanionSyncStatusDetails
        endpointUrl={props.endpointUrl}
        lastSyncedAt={props.lastSyncedAt}
        pairingState={props.pairingState}
        status={props.status}
        syncEvents={props.syncEvents}
      />
      <div className="mt-5">
        <PrimaryAction disabled={isSyncing} onClick={props.onSyncNow}>
          {isSyncing ? 'Syncing...' : 'Sync now'}
        </PrimaryAction>
      </div>
    </SyncStatusCard>
  );
}

function AwaitingApprovalState(props: {
  disabled: boolean;
  onCancel(): void;
  onComplete(): void;
}) {
  return (
    <SyncStatusCard
      detail="Approve this device on the device that already has your content. Then come back here to continue."
      title="Waiting for approval"
    >
      <div className="space-y-3">
        <PrimaryAction disabled={props.disabled} onClick={props.onComplete}>
          {props.disabled ? 'Checking approval...' : 'Continue'}
        </PrimaryAction>
        <button
          className="w-full rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-45"
          disabled={props.disabled}
          onClick={props.onCancel}
          type="button"
        >
          Choose another device
        </button>
      </div>
    </SyncStatusCard>
  );
}

function SearchingDiscoveryState() {
  return (
    <SyncStatusCard
      detail="Looking for another device with Device sync turned on. Keep both devices on the same Wi-Fi."
      title="Looking for another device"
    />
  );
}

function EmptyDiscoveryState(props: {
  disabled: boolean;
  onTryAgain(): void;
}) {
  return (
    <div className="text-center">
      <h2 className="text-xl font-semibold leading-tight text-foreground">Bring content from another device</h2>
      <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-accent">
        First open Device sync on the device that already has your content, then allow this device to connect.
      </p>
      <div className="mt-6">
        <PrimaryAction disabled={props.disabled} onClick={props.onTryAgain}>
          {props.disabled ? 'Looking...' : 'Connect another device'}
        </PrimaryAction>
      </div>
    </div>
  );
}

export function CompanionSyncPanel(props: CompanionSyncPanelProps) {
  const endpointUrl = resolveEndpoint(props);
  const isBusy = props.pairingStatus !== 'idle' && props.pairingStatus !== 'awaiting-approval';
  const desktopDiscoveries = resolveDesktopDiscoveries(props);

  async function handleTryAgain() {
    props.onClearError();
    await props.onCheckDesktop(endpointUrl);
  }

  async function handlePair(pairingEndpointUrl: string) {
    props.onClearError();
    await props.onRequestPairing(pairingEndpointUrl);
  }

  async function handleCompletePairing() {
    props.onClearError();
    await props.onCompletePairing();
    await props.onPull(endpointUrl);
  }

  return (
    <section className="mb-8 px-5 py-5">
      <div className="flex flex-col gap-5">
        {props.pairingState.is_paired ? (
          <ConnectedState
            endpointUrl={endpointUrl}
            lastSyncedAt={props.lastSyncedAt}
            onSyncNow={() => void props.onPull(endpointUrl)}
            pairingState={props.pairingState}
            status={props.status}
            syncEvents={props.syncEvents}
          />
        ) : props.pairingRequest ? (
          <AwaitingApprovalState
            disabled={props.pairingStatus === 'completing-pair'}
            onCancel={props.onCancelPairing}
            onComplete={() => void handleCompletePairing()}
          />
        ) : desktopDiscoveries.length > 0 ? (
          <CompanionSyncDeviceList
            desktops={desktopDiscoveries}
            disabled={props.pairingStatus === 'requesting-pair'}
            onPair={(pairingEndpointUrl) => void handlePair(pairingEndpointUrl)}
          />
        ) : props.pairingStatus === 'checking-desktop' ? (
          <SearchingDiscoveryState />
        ) : (
          <EmptyDiscoveryState disabled={isBusy} onTryAgain={() => void handleTryAgain()} />
        )}
        {props.error ? <p className="text-sm text-red-700">{props.error}</p> : null}
        <CompanionHandoffReminderSettingsPanel
          settings={props.handoffReminderSettings}
          onChange={props.onChangeHandoffReminderSettings}
        />
      </div>
    </section>
  );
}
