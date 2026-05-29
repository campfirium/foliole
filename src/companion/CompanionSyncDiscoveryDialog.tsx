import { RefreshCw } from 'lucide-react';

import { AppSpinner } from '../shared/ui';

import { CompanionSyncDeviceList } from './CompanionSyncDeviceList';
import type { CompanionDesktopDiscovery } from './useCompanionWorkspacePairing';

function SearchingDiscoveryContent(props: {
  onRefresh(): void;
}) {
  return (
    <>
      <h2 className="text-xl font-semibold leading-tight text-foreground">Looking for another device</h2>
      <p className="mt-3 text-sm leading-6 text-accent">
        Keep both devices on the same Wi-Fi and open Device sync on the desktop.
      </p>
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-accent">
          <AppSpinner decorative size="sm" />
          <span>Searching...</span>
        </div>
        <button
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-companion-divider px-4 py-2 text-sm font-medium text-foreground transition active:bg-companion-subtle/80"
          onClick={props.onRefresh}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.8} />
          Refresh
        </button>
      </div>
    </>
  );
}

function FoundDevicesDiscoveryContent(props: {
  desktops: CompanionDesktopDiscovery[];
  disabled: boolean;
  isConnecting: boolean;
  onPair(endpointUrl: string): void;
}) {
  const deviceCount = props.desktops.length;
  return (
    <>
      <h2 className="text-xl font-semibold leading-tight text-foreground">
        Found {deviceCount} {deviceCount === 1 ? 'device' : 'devices'}
      </h2>
      <p className="mt-3 text-sm leading-6 text-accent">
        Connect to this desktop to bring your topics onto this device.
      </p>
      <div className="mt-5">
        <CompanionSyncDeviceList
          desktops={props.desktops}
          disabled={props.disabled}
          isConnecting={props.isConnecting}
          onPair={props.onPair}
          showHeading={false}
        />
      </div>
    </>
  );
}

export function CompanionSyncDiscoveryDialog(props: {
  desktops: CompanionDesktopDiscovery[];
  disabled: boolean;
  isConnecting: boolean;
  isSearching: boolean;
  onPair(endpointUrl: string): void;
  onRefresh(): void;
}) {
  const isOpen = props.isSearching || props.desktops.length > 0;
  if (!isOpen) return null;
  return (
    <section className="rounded-2xl border border-companion-divider bg-companion-content px-5 py-5">
      {props.isSearching ? (
        <SearchingDiscoveryContent onRefresh={props.onRefresh} />
      ) : (
        <FoundDevicesDiscoveryContent
          desktops={props.desktops}
          disabled={props.disabled}
          isConnecting={props.isConnecting}
          onPair={props.onPair}
        />
      )}
    </section>
  );
}
