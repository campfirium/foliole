import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppSpinner } from '../shared/ui';

import { UNKNOWN_DESKTOP_PLATFORM } from './companionWorkspacePairingModel';
import type { CompanionDesktopDiscovery } from './useCompanionWorkspacePairing';

function formatEndpoint(endpointUrl: string) {
  try {
    const parsed = new URL(endpointUrl);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return endpointUrl;
  }
}

function resolveDeviceTitle(desktop: CompanionDesktopDiscovery, unknownHost: string) {
  return desktop.desktopDeviceName || unknownHost;
}

function resolveDesktopPlatform(desktop: CompanionDesktopDiscovery, desktopFallback: string) {
  return desktop.desktopPlatform !== UNKNOWN_DESKTOP_PLATFORM ? desktop.desktopPlatform : desktopFallback;
}

function PairAction(props: {
  disabled: boolean;
  isConnecting: boolean;
  onClick(): void;
}) {
  const t = useTranslation();
  return (
    <button
      aria-busy={props.isConnecting || undefined}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-companion-divider px-4 py-2 text-sm font-medium text-foreground transition active:bg-companion-subtle/80 disabled:cursor-not-allowed ${props.isConnecting ? 'disabled:opacity-100' : 'disabled:opacity-45'}`}
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      {props.isConnecting ? (
        <>
          <AppSpinner className="pointer-events-none shrink-0" decorative size="sm" />
          <span>{t('companion.sync.discovery.connecting')}</span>
        </>
      ) : t('companion.sync.discovery.connect')}
    </button>
  );
}

function DeviceRow(props: {
  desktop: CompanionDesktopDiscovery;
  disabled: boolean;
  isConnecting: boolean;
  onPair(endpointUrl: string): void;
}) {
  const t = useTranslation();
  const deviceTitle = resolveDeviceTitle(props.desktop, t('companion.sync.discovery.unknownHost'));
  const desktopPlatform = resolveDesktopPlatform(props.desktop, t('companion.sync.discovery.desktopFallback'));
  const endpointLabel = formatEndpoint(props.desktop.endpointUrl);
  const isCompatible = props.desktop.compatibility.status === 'compatible';
  return (
    <div className="px-1 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-tight text-foreground">
            {deviceTitle} <span className="font-medium text-accent">({desktopPlatform})</span>
          </p>
          <p className="mt-1 truncate text-xs text-accent">{endpointLabel}</p>
          {isCompatible ? null : (
            <p className="mt-1 text-xs leading-5 text-accent">
              {t('companion.sync.discovery.incompatible')}
            </p>
          )}
        </div>
        <PairAction
          disabled={props.disabled || !isCompatible}
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
  const t = useTranslation();
  const deviceCount = props.desktops.length;
  const unit = t(deviceCount === 1 ? 'companion.sync.discovery.device' : 'companion.sync.discovery.devices');
  return (
    <div>
      {props.showHeading === false ? null : (
        <h2 className="text-xl font-semibold leading-tight text-foreground">
          {t('companion.sync.discovery.found', { count: deviceCount, unit })}
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
