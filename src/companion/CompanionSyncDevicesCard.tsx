import type { ReactNode } from 'react';

import type { NativeCompanionPairingState } from '../../lib/platform/nativeCompanionSyncContract';

import type { CompanionDesktopDiscovery } from './useCompanionWorkspacePairing';

export function formatDesktopAddress(endpointUrl: string) {
  try {
    const url = new URL(endpointUrl);
    return url.host || endpointUrl;
  } catch {
    return endpointUrl || 'Desktop';
  }
}

function formatDeviceKind(deviceKind: string | null) {
  if (deviceKind === 'android-capacitor' || deviceKind === 'android') return 'Android';
  return deviceKind?.trim() || 'Device';
}

export function resolveDesktopDeviceInfo(endpointUrl: string, discovery: CompanionDesktopDiscovery | null) {
  const address = formatDesktopAddress(endpointUrl);
  return {
    address,
    detail: `${discovery?.desktopPlatform?.trim() || 'Desktop'} · ${address}`,
    name: discovery?.desktopDeviceName?.trim() || 'Paired desktop'
  };
}

export function resolveLocalDeviceInfo(pairingState: NativeCompanionPairingState) {
  const kind = formatDeviceKind(pairingState.device_kind);
  return {
    detail: `${kind} · This device`,
    name: pairingState.device_name?.trim() || 'This device'
  };
}

function PrimaryBadge() {
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-companion-text-secondary">
      Primary
    </span>
  );
}

function DeviceRow(props: {
  action: ReactNode;
  detail: string;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{props.title}</div>
        <div className="mt-0.5 truncate text-xs text-companion-text-secondary">{props.detail}</div>
      </div>
      <div className="shrink-0">{props.action}</div>
    </div>
  );
}

export function CompanionSyncConnectionPage(props: {
  desktopDiscovery: CompanionDesktopDiscovery | null;
  endpointUrl: string;
  isPrimary: boolean;
  isSyncing: boolean;
  pairingState: NativeCompanionPairingState;
  onSetPrimary(endpointUrl: string): void;
}) {
  const desktop = resolveDesktopDeviceInfo(props.endpointUrl, props.desktopDiscovery);
  const local = resolveLocalDeviceInfo(props.pairingState);
  return (
    <section className="border-t border-companion-divider">
      <div className="flex flex-col gap-1 border-b border-companion-divider py-4">
        <DeviceRow
          detail={local.detail}
          title={local.name}
          action={props.isPrimary ? (
            <PrimaryBadge />
          ) : (
            <button
              className="rounded-2xl border border-border-strong bg-bg-elevated px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-45"
              disabled={props.isSyncing}
              onClick={() => props.onSetPrimary(props.endpointUrl)}
              type="button"
            >
              Set as primary
            </button>
          )}
        />
        <DeviceRow
          detail={desktop.detail}
          title={desktop.name}
          action={props.isPrimary ? (
            <span className="text-xs font-medium text-companion-text-secondary">Connected</span>
          ) : (
            <PrimaryBadge />
          )}
        />
      </div>
      <div className="py-4 text-xs leading-5 text-companion-text-secondary">
        The primary device runs external imports and sync authority. Only one paired device is primary at a time.
      </div>
    </section>
  );
}
