import { RefreshCw } from 'lucide-react';

import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppSpinner
} from '../shared/ui';

import { CompanionSyncDeviceList } from './CompanionSyncDeviceList';
import type { CompanionDesktopDiscovery } from './useCompanionWorkspacePairing';

function SearchingDialogBody(props: {
  onRefresh(): void;
}) {
  return (
    <>
      <AppDialogTitle>Looking for another device</AppDialogTitle>
      <AppDialogDescription className="mt-2">
        Keep both devices on the same Wi-Fi and open Device sync on the desktop.
      </AppDialogDescription>
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-accent">
          <AppSpinner decorative size="sm" />
          <span>Searching...</span>
        </div>
        <button
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border-strong px-4 py-2 text-sm font-medium text-foreground transition hover:bg-bg-subtle"
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

function FoundDevicesDialogBody(props: {
  desktops: CompanionDesktopDiscovery[];
  disabled: boolean;
  isConnecting: boolean;
  onPair(endpointUrl: string): void;
}) {
  const deviceCount = props.desktops.length;
  return (
    <>
      <AppDialogTitle>
        Found {deviceCount} {deviceCount === 1 ? 'device' : 'devices'}
      </AppDialogTitle>
      <AppDialogDescription className="mt-2">
        Connect to this desktop to bring your topics onto this device.
      </AppDialogDescription>
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
  return (
    <AppDialog open={isOpen}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[calc(100vw-3rem)] max-w-[420px] px-5 py-5">
          {props.isSearching ? (
            <SearchingDialogBody onRefresh={props.onRefresh} />
          ) : (
            <FoundDevicesDialogBody
              desktops={props.desktops}
              disabled={props.disabled}
              isConnecting={props.isConnecting}
              onPair={props.onPair}
            />
          )}
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
