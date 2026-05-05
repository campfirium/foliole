import { useEffect, useState } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { NativeCompanionPairingState } from '../../lib/platform/nativeCompanionSyncContract';

import { CompanionSyncTargetForm } from './CompanionSyncTargetForm';

type CompanionSyncPanelProps = {
  bootstrapState: NativeCompanionBootstrapState;
  desktopDiscovery: {
    desktopName: string;
    endpointUrl: string;
    peerId: string;
  } | null;
  endpointUrl: string | null;
  error: string | null;
  lastSyncedAt: string | null;
  rememberedTargets: string[];
  onCheckDesktop(endpointUrl: string): Promise<unknown>;
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

function formatTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return null;
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleString();
}

function renderPairingStatus(pairingState: NativeCompanionPairingState) {
  const pairedAtLabel = formatTimestamp(pairingState.paired_at);
  if (pairingState.is_paired) {
    return pairedAtLabel ? `Connected to another device since ${pairedAtLabel}.` : 'Connected to another device.';
  }
  return 'This device is not connected to another device yet.';
}

function DeviceCard(props: Pick<CompanionSyncPanelProps, 'bootstrapState' | 'pairingState'>) {
  return (
    <div className="rounded-2xl border border-border bg-canvas px-4 py-4">
      <p className="text-sm font-medium text-foreground">This device</p>
      <p className="mt-2 text-sm text-accent">
        {props.bootstrapState.runtime_kind === 'android-capacitor' ? 'Android companion' : 'Web preview companion'}
      </p>
      <p className="mt-3 text-sm text-foreground">{renderPairingStatus(props.pairingState)}</p>
    </div>
  );
}

function SetupCard(props: Pick<CompanionSyncPanelProps, 'lastSyncedAt' | 'pairingState'>) {
  if (props.lastSyncedAt) {
    return null;
  }
  return (
    <div className="rounded-2xl border border-border bg-canvas px-4 py-4 text-sm text-foreground">
      <p className="font-medium">{props.pairingState.is_paired ? 'Bring content to this device for the first time' : 'Connect to another device'}</p>
      <p className="mt-2 text-accent">
        {props.pairingState.is_paired
          ? 'You are already connected. The next step is to bring your content here with one manual sync.'
          : 'First make sure the device that already has your content has device sync turned on, then continue here.'}
      </p>
    </div>
  );
}

function ConnectionIntro() {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.22em] text-accent">Device sync</p>
      <h2 className="mt-2 text-lg font-semibold text-foreground">Bring content from another device</h2>
      <p className="mt-2 text-sm leading-6 text-accent">
        Use this page to connect this device and pull content from a device you already use. After pairing, saved devices stay available for quiet reconnects.
      </p>
    </div>
  );
}

function PairingActionRow(props: {
  onCheckDesktop(): Promise<void>;
  onCompletePairing(): Promise<unknown>;
  onRequestPairing(): Promise<void>;
  pairingRequest: CompanionSyncPanelProps['pairingRequest'];
  pairingStatus: CompanionSyncPanelProps['pairingStatus'];
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <button
        className="rounded-2xl border border-border bg-canvas px-4 py-3 text-sm font-medium text-foreground shadow-panel transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
        disabled={props.pairingStatus !== 'idle'}
        onClick={() => void props.onCheckDesktop()}
        type="button"
      >
        {props.pairingStatus === 'checking-desktop' ? 'Checking...' : 'Check this address'}
      </button>
      <button
        className="rounded-2xl border border-border bg-canvas px-4 py-3 text-sm font-medium text-foreground shadow-panel transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
        disabled={props.pairingStatus !== 'idle'}
        onClick={() => void props.onRequestPairing()}
        type="button"
      >
        {props.pairingStatus === 'requesting-pair' ? 'Requesting...' : 'Ask to connect'}
      </button>
      <button
        className="rounded-2xl border border-border bg-canvas px-4 py-3 text-sm font-medium text-foreground shadow-panel transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!props.pairingRequest || (props.pairingStatus !== 'awaiting-approval' && props.pairingStatus !== 'idle')}
        onClick={() => void props.onCompletePairing()}
        type="button"
      >
        {props.pairingStatus === 'completing-pair' ? 'Finishing...' : 'Finish pairing'}
      </button>
    </div>
  );
}

function DiscoveryCard(props: { desktopDiscovery: CompanionSyncPanelProps['desktopDiscovery'] }) {
  if (!props.desktopDiscovery) {
    return null;
  }
  return (
    <div className="rounded-2xl border border-border bg-canvas px-4 py-4 text-sm text-foreground">
      <p className="font-medium">Device found at this address</p>
      <p className="mt-2 text-foreground">{props.desktopDiscovery.desktopName}</p>
      <p className="mt-1 text-accent">{props.desktopDiscovery.endpointUrl}</p>
    </div>
  );
}

function PendingPairRequestCard(props: { pairingRequest: CompanionSyncPanelProps['pairingRequest'] }) {
  if (!props.pairingRequest) {
    return null;
  }
  return (
    <div className="rounded-2xl border border-border bg-canvas px-4 py-4 text-sm text-foreground">
      <p className="font-medium">Waiting for approval</p>
      <p className="mt-1 text-accent">Allow the request on the other device, then come back here and finish pairing.</p>
      <p className="mt-2 text-xs text-accent">
        Request expires at {formatTimestamp(props.pairingRequest.expiresAt) ?? props.pairingRequest.expiresAt}
      </p>
    </div>
  );
}

export function CompanionSyncPanel(props: CompanionSyncPanelProps) {
  const [endpointInput, setEndpointInput] = useState(props.endpointUrl ?? EMULATOR_DEFAULT_ENDPOINT);

  useEffect(() => {
    setEndpointInput(props.endpointUrl ?? EMULATOR_DEFAULT_ENDPOINT);
  }, [props.endpointUrl]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    props.onClearError();
    await props.onSaveEndpoint(endpointInput);
    await props.onPull(endpointInput);
  }

  async function handleCheckDesktop() {
    props.onClearError();
    await props.onCheckDesktop(endpointInput);
  }

  async function handleRequestPairing() {
    props.onClearError();
    await props.onRequestPairing(endpointInput);
  }

  return (
    <section className="mb-8 rounded-3xl border border-border bg-bg-panel px-5 py-5 shadow-panel">
      <div className="flex flex-col gap-5">
        <ConnectionIntro />
        <SetupCard lastSyncedAt={props.lastSyncedAt} pairingState={props.pairingState} />
        <DeviceCard bootstrapState={props.bootstrapState} pairingState={props.pairingState} />
        <CompanionSyncTargetForm
          currentEndpointUrl={props.endpointUrl}
          endpointInput={endpointInput}
          isPaired={props.pairingState.is_paired}
          onChange={setEndpointInput}
          onRemoveRememberedTarget={(target) => {
            void props.onRemoveRememberedTarget(target);
          }}
          onSelectRememberedTarget={setEndpointInput}
          onSubmit={handleSubmit}
          rememberedTargets={props.rememberedTargets}
          status={props.status}
        />
        <PairingActionRow
          onCheckDesktop={handleCheckDesktop}
          onCompletePairing={props.onCompletePairing}
          onRequestPairing={handleRequestPairing}
          pairingRequest={props.pairingRequest}
          pairingStatus={props.pairingStatus}
        />
        <DiscoveryCard desktopDiscovery={props.desktopDiscovery} />
        <PendingPairRequestCard pairingRequest={props.pairingRequest} />
        <p className="text-xs text-accent">
          {props.lastSyncedAt ? `Last synced at ${formatTimestamp(props.lastSyncedAt)}` : 'This device does not have synced content yet.'}
        </p>
        {props.error ? <p className="text-sm text-red-700">{props.error}</p> : null}
      </div>
    </section>
  );
}
