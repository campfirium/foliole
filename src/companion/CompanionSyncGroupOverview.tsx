import { resolveSyncGroupDisplayDeviceName, type SyncGroupDevicePayload, type SyncGroupPayload } from '../../lib/platform/syncGroupContract';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppSpinner } from '../shared/ui';

const PLATFORM_LABELS: Record<string, string> = {
  android: 'Android', darwin: 'macOS', ios: 'iOS', linux: 'Linux', win32: 'Windows'
};

function platformFor(kind: string) {
  const key = Object.keys(PLATFORM_LABELS).find((candidate) => kind.toLowerCase().includes(candidate));
  return key ? PLATFORM_LABELS[key]! : kind;
}

function isDesktopDevice(device: SyncGroupDevicePayload) {
  return ['darwin', 'linux', 'win32'].some((kind) => device.platform.toLowerCase().includes(kind));
}

function overviewDevice(group: SyncGroupPayload) {
  const remoteDevices = group.devices.filter((device) => device.device_identity_key !== group.local_device_identity_key);
  const active = remoteDevices.filter((device) => device.state === 'active');
  if (active.length === 1) return active[0]!;
  return active.find(isDesktopDevice) ?? active[0] ?? null;
}

export function CompanionSyncGroupOverview(props: {
  group: SyncGroupPayload;
  isSyncing: boolean;
  onOpen(): void;
  sourceHostName: string | null;
}) {
  const t = useTranslation();
  const device = overviewDevice(props.group);
  const groupName = t('settings.companionSync.group.named', {
    name: resolveSyncGroupDisplayDeviceName(props.group)
  });
  return (
    <section className="border-y border-companion-divider text-foreground">
      <div className="flex items-start justify-between gap-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t('companion.sync.group.current')}</h2>
          <p className="mt-1 truncate text-base font-semibold text-foreground">{groupName}</p>
        </div>
        <button className="min-h-11 shrink-0 touch-manipulation rounded-md px-2 py-2 text-sm font-medium text-companion-text-secondary transition active:bg-companion-subtle/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-companion-accent"
          data-testid="companion-sync-group-open" onClick={props.onOpen} type="button">
          {t('companion.sync.group.details')}
        </button>
      </div>
      {device ? (
        <div className="flex min-h-14 items-center justify-between gap-4 border-t border-companion-divider py-2.5"
          data-testid="companion-sync-group-device">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{device.device_name}</span>
            <span className="shrink-0 text-xs text-companion-text-tertiary">{platformFor(device.platform)}</span>
          </span>
          {props.isSyncing && device.device_name === props.sourceHostName ? (
            <span className="flex shrink-0 items-center gap-2 text-sm text-companion-text-secondary"
              data-testid="companion-sync-source-indicator">
              <AppSpinner decorative size="sm" /><span className="sr-only">{t('companion.sync.syncing')}</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
