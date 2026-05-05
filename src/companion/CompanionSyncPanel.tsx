import { useEffect, useState } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionPairingState, NativeCompanionSyncEvent } from '../../lib/platform/nativeCompanionSyncContract';

import type { CompanionHandoffReminderSettings } from './companionHandoffReminderSettings';
import { CompanionHandoffReminderSettingsPanel } from './CompanionHandoffReminderSettingsPanel';
import { CompanionSyncDiscoveryDialog } from './CompanionSyncDiscoveryDialog';
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
  syncedTopicCount: number;
  syncConflictCount: number;
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

function ConnectedState(props: Pick<CompanionSyncPanelProps, 'lastSyncedAt' | 'onOpenSettingsPage' | 'page' | 'pairingState' | 'status' | 'syncedTopicCount' | 'syncConflictCount' | 'syncEvents'> & {
  endpointUrl: string;
}) {
  return (
    <CompanionSyncStatusDetails
      endpointUrl={props.endpointUrl}
      lastSyncedAt={props.lastSyncedAt}
      pairingState={props.pairingState}
      status={props.status}
      syncedTopicCount={props.syncedTopicCount}
      syncConflictCount={props.syncConflictCount}
      syncEvents={props.syncEvents}
      page={props.page}
      onOpenPage={props.onOpenSettingsPage}
    />
  );
}

function useExpiryCountdown(expiresAtIso: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [expiresAtIso]);
  const expiresAt = new Date(expiresAtIso).getTime();
  const remainingMs = Math.max(0, expiresAt - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  return { isExpired: remainingMs <= 0, remainingMs, remainingSeconds };
}

function AwaitingApprovalState(props: {
  expiresAt: string;
  onCancel(): void;
}) {
  const { isExpired, remainingMs, remainingSeconds } = useExpiryCountdown(props.expiresAt);
  const totalWindowMs = 45_000;
  const progressPct = Math.min(100, Math.max(0, (remainingMs / totalWindowMs) * 100));
  return (
    <SyncStatusCard
      detail="Look at the desktop you're connecting to and tap Approve. We'll continue automatically as soon as you do."
      title="Asking the desktop to allow this device"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-sm text-foreground">
          <span aria-hidden className="relative inline-flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-foreground" />
          </span>
          <span>
            {isExpired
              ? 'Request expired. Tap Cancel and try again.'
              : `Waiting for approval... ${remainingSeconds}s left`}
          </span>
        </div>
        <div
          aria-hidden
          className="h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle"
        >
          <div
            className="h-full rounded-full bg-foreground transition-all duration-500 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <button
          className="w-full rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:bg-bg-subtle"
          onClick={props.onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </SyncStatusCard>
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

  return (
    <section className="mb-8 px-5 py-5">
      <div className="flex flex-col gap-5">
        {hasPairing ? (
          props.page === 'syncHandoff' ? null : (
            <ConnectedState
              endpointUrl={endpointUrl}
              lastSyncedAt={props.lastSyncedAt}
              pairingState={props.pairingState}
              status={props.status}
              syncedTopicCount={props.syncedTopicCount}
              syncConflictCount={props.syncConflictCount}
              syncEvents={props.syncEvents}
              page={props.page}
              onOpenSettingsPage={props.onOpenSettingsPage}
            />
          )
        ) : props.pairingRequest ? (
          <AwaitingApprovalState
            expiresAt={props.pairingRequest.expiresAt}
            onCancel={props.onCancelPairing}
          />
        ) : isDiscovering ? null : (
          <EmptyDiscoveryState disabled={isBusy} onTryAgain={() => void handleTryAgain()} />
        )}
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
