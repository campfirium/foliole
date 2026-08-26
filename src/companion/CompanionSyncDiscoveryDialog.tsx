import { RefreshCw } from 'lucide-react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppSpinner } from '../shared/ui';

import { CompanionSyncDeviceList } from './CompanionSyncDeviceList';
import type { CompanionSyncGroupDiscovery } from './companionSyncGroupJoinModel';

function SearchingDiscoveryContent(props: {
  onRefresh(): void;
}) {
  const t = useTranslation();
  return (
    <>
      <h2 className="text-xl font-semibold leading-tight text-foreground">{t('companion.sync.discovery.title')}</h2>
      <p className="mt-3 text-sm leading-6 text-accent">
        {t('companion.sync.discovery.description')}
      </p>
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-accent">
          <AppSpinner decorative size="sm" />
          <span>{t('companion.sync.discovery.searching')}</span>
        </div>
        <button
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-companion-divider px-4 py-2 text-sm font-medium text-foreground transition active:bg-companion-subtle/80"
          onClick={props.onRefresh}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.8} />
          {t('companion.sync.discovery.refresh')}
        </button>
      </div>
    </>
  );
}

function FoundDevicesDiscoveryContent(props: {
  devices: CompanionSyncGroupDiscovery[];
  disabled: boolean;
  isConnecting: boolean;
  onJoin(endpointUrl: string): void;
}) {
  const t = useTranslation();
  const deviceCount = props.devices.length;
  const unit = t(deviceCount === 1 ? 'companion.sync.discovery.device' : 'companion.sync.discovery.devices');
  return (
    <>
      <h2 className="text-xl font-semibold leading-tight text-foreground">
        {t('companion.sync.discovery.found', { count: deviceCount, unit })}
      </h2>
      <p className="mt-3 text-sm leading-6 text-accent">
        {t('companion.sync.discovery.foundDescription')}
      </p>
      <div className="mt-5">
        <CompanionSyncDeviceList
          devices={props.devices}
          disabled={props.disabled}
          isConnecting={props.isConnecting}
          onJoin={props.onJoin}
          showHeading={false}
        />
      </div>
    </>
  );
}

export function CompanionSyncDiscoveryDialog(props: {
  devices: CompanionSyncGroupDiscovery[];
  disabled: boolean;
  isConnecting: boolean;
  isSearching: boolean;
  onJoin(endpointUrl: string): void;
  onRefresh(): void;
}) {
  const isOpen = props.isSearching || props.devices.length > 0;
  if (!isOpen) return null;
  return (
    <section className="rounded-2xl border border-companion-divider bg-companion-content px-5 py-5">
      {props.isSearching && props.devices.length === 0 ? (
        <SearchingDiscoveryContent onRefresh={props.onRefresh} />
      ) : (
        <FoundDevicesDiscoveryContent
          devices={props.devices}
          disabled={props.disabled}
          isConnecting={props.isConnecting}
          onJoin={props.onJoin}
        />
      )}
    </section>
  );
}
