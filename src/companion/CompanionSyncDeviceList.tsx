import { AppSpinner } from '../shared/ui';

import type { CompanionDesktopDiscovery } from './useCompanionWorkspacePairing';

function formatEndpoint(endpointUrl: string) {
  try {
    const parsed = new URL(endpointUrl);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return endpointUrl;
  }
}

function resolveDeviceTitle(desktop: CompanionDesktopDiscovery) {
  return desktop.hostName !== 'Unknown host' ? desktop.hostName : desktop.desktopDeviceName;
}

function PairAction(props: {
  disabled: boolean;
  isConnecting: boolean;
  onClick(): void;
}) {
  return (
    <button
      className="shrink-0 rounded-xl border border-border-strong px-4 py-2 text-sm font-medium text-foreground transition hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-45"
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      {props.isConnecting ? (
        <>
          <AppSpinner decorative size="sm" />
          Connecting...
        </>
      ) : 'Connect'}
    </button>
  );
}

function DeviceRow(props: {
  desktop: CompanionDesktopDiscovery;
  disabled: boolean;
  isConnecting: boolean;
  onPair(endpointUrl: string): void;
}) {
  const deviceTitle = resolveDeviceTitle(props.desktop);
  const endpointLabel = formatEndpoint(props.desktop.endpointUrl);
  return (
    <div className="px-1 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-tight text-foreground">
            {deviceTitle} <span className="font-medium text-accent">({props.desktop.desktopPlatform})</span>
          </p>
          <p className="mt-1 truncate text-xs text-accent">{endpointLabel}</p>
        </div>
        <PairAction
          disabled={props.disabled}
          isConnecting={props.isConnecting}
          onClick={() => props.onPair(props.desktop.endpointUrl)}
        />
      </div>
    </div>
  );
}

export function CompanionSyncDeviceList(props: {
  desktops: CompanionDesktopDiscovery[];
  disabled: boolean;
  isConnecting?: boolean;
  onPair(endpointUrl: string): void;
  showHeading?: boolean;
}) {
  const deviceCount = props.desktops.length;
  return (
    <div>
      {props.showHeading === false ? null : (
        <h2 className="text-xl font-semibold leading-tight text-foreground">
          Found {deviceCount} {deviceCount === 1 ? 'device' : 'devices'}
        </h2>
      )}
      <div className={props.showHeading === false ? 'flex flex-col gap-2' : 'mt-3 flex flex-col gap-2'}>
        {props.desktops.map((desktop) => (
          <DeviceRow
            desktop={desktop}
            disabled={props.disabled}
            isConnecting={props.isConnecting === true}
            key={`${desktop.peerId}:${desktop.endpointUrl}`}
            onPair={props.onPair}
          />
        ))}
      </div>
    </div>
  );
}
