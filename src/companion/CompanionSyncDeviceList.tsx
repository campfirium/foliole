import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppSpinner } from '../shared/ui';

import type { CompanionSyncGroupDiscovery } from './companionSyncGroupJoinModel';

function formatEndpoint(endpointUrl: string) {
  try {
    const parsed = new URL(endpointUrl);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return endpointUrl;
  }
}

function resolveDeviceTitle(device: CompanionSyncGroupDiscovery, unknownHost: string) {
  return device.groupDisplayName || device.providerDeviceName || unknownHost;
}

function resolveDevicePlatform(device: CompanionSyncGroupDiscovery, fallback: string) {
  return device.providerPlatform || fallback;
}

function JoinAction(props: {
  accessibilityLabel: string;
  disabled: boolean;
  endpointUrl: string;
  isConnecting: boolean;
  onClick(): void;
}) {
  const t = useTranslation();
  return (
    <button
      aria-label={props.accessibilityLabel}
      aria-busy={props.isConnecting || undefined}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-companion-divider px-4 py-2 text-sm font-medium text-foreground transition active:bg-companion-subtle/80 disabled:cursor-not-allowed ${props.isConnecting ? 'disabled:opacity-100' : 'disabled:opacity-45'}`}
      disabled={props.disabled}
      data-sync-endpoint={props.endpointUrl}
      data-testid="companion-sync-group-join"
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
  device: CompanionSyncGroupDiscovery;
  disabled: boolean;
  isConnecting: boolean;
  onJoin(endpointUrl: string): void;
}) {
  const t = useTranslation();
  const deviceTitle = resolveDeviceTitle(props.device, t('companion.sync.discovery.unknownHost'));
  const devicePlatform = resolveDevicePlatform(props.device, t('companion.sync.discovery.desktopFallback'));
  const endpointLabel = formatEndpoint(props.device.endpointUrl);
  const isCompatible = props.device.compatibility.status === 'compatible';
  return (
    <div className="px-1 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-tight text-foreground">
            {deviceTitle} <span className="font-medium text-accent">({devicePlatform})</span>
          </p>
          <p className="mt-1 truncate text-xs text-accent">{endpointLabel}</p>
          {isCompatible ? null : (
            <p className="mt-1 text-xs leading-5 text-accent">
              {t('companion.sync.discovery.incompatible')}
            </p>
          )}
        </div>
        <JoinAction
          accessibilityLabel={`${t('companion.sync.discovery.connect')}: ${deviceTitle} (${devicePlatform})`}
          disabled={props.disabled || !isCompatible}
          endpointUrl={props.device.endpointUrl}
          isConnecting={props.isConnecting}
          onClick={() => props.onJoin(props.device.endpointUrl)}
        />
      </div>
    </div>
  );
}

export function CompanionSyncDeviceList(props: {
  devices: CompanionSyncGroupDiscovery[];
  disabled: boolean;
  isConnecting?: boolean;
  onJoin(endpointUrl: string): void;
  showHeading?: boolean;
}) {
  const t = useTranslation();
  const deviceCount = props.devices.length;
  const unit = t(deviceCount === 1 ? 'companion.sync.discovery.device' : 'companion.sync.discovery.devices');
  return (
    <div>
      {props.showHeading === false ? null : (
        <h2 className="text-xl font-semibold leading-tight text-foreground">
          {t('companion.sync.discovery.found', { count: deviceCount, unit })}
        </h2>
      )}
      <div className={props.showHeading === false ? 'flex flex-col gap-2' : 'mt-3 flex flex-col gap-2'}>
        {props.devices.map((device) => (
          <DeviceRow
            device={device}
            disabled={props.disabled}
            isConnecting={props.isConnecting === true}
            key={`${device.providerDeviceId}:${device.endpointUrl}`}
            onJoin={props.onJoin}
          />
        ))}
      </div>
    </div>
  );
}
