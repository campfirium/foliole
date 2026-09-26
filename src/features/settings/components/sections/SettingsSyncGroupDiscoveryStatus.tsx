import type { SyncGroupDiscoverySnapshot } from '../../../../../lib/platform/syncGroupDiscoveryContract';
import { normalizeDesktopSyncGroupPlatform } from '../../../../../lib/platform/syncGroupPlatform';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';

export function DiscoveryStatusRow(props: {
  discovery: SyncGroupDiscoverySnapshot;
  disabled: boolean;
  onDiscover(): void;
  onOpenSettings(): void;
  platform?: string | undefined;
}) {
  const t = useTranslation();
  const { discovery } = props;
  if (discovery.status === 'searching') {
    return <span className="text-ui-sm text-muted-foreground">{t('settings.companionSync.group.discovery.searching')}</span>;
  }
  if (discovery.status === 'stopped') return null;
  const macDenied = discovery.status === 'permission_required' &&
    normalizeDesktopSyncGroupPlatform(props.platform ?? '') === 'darwin';
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <span className="text-ui-sm text-muted-foreground">{t(`settings.companionSync.group.discovery.${discovery.status}`)}
        {macDenied ? ` ${t('settings.companionSync.group.discovery.macos_settings')}` : null}</span>
      <div className="flex shrink-0 items-center gap-2">
        {macDenied ? <button className="rounded-sm px-2 py-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={props.onOpenSettings} type="button">{t('settings.companionSync.group.discovery.open_settings')}</button> : null}
        <button className="rounded-sm py-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          disabled={props.disabled} onClick={props.onDiscover} type="button">
          {t('settings.companionSync.group.discovery.retry')}
        </button>
      </div>
    </div>
  );
}

export function ActiveDiscoveryErrorRow(props: {
  discoveryError: 'permission_required' | 'unavailable' | null;
  hostPlatform: string | null;
  isBusy: boolean;
  onRecoverDiscovery(): void;
  onOpenSettings(): void;
  syncEnabled: boolean;
}) {
  const t = useTranslation();
  if (!props.syncEnabled || !props.discoveryError) return null;
  const message = props.discoveryError === 'permission_required'
    ? 'settings.companionSync.group.discovery.active_permission_required'
    : 'settings.companionSync.group.discovery.active_unavailable';
  const macDenied = props.discoveryError === 'permission_required' &&
    normalizeDesktopSyncGroupPlatform(props.hostPlatform ?? '') === 'darwin';
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-ui-sm text-muted-foreground">
      <span>{t(message)}{macDenied ? ` ${t('settings.companionSync.group.discovery.macos_settings')}` : null}</span>
      <div className="flex shrink-0 items-center gap-2">
        {macDenied ? <button className="rounded-sm px-2 py-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={props.onOpenSettings} type="button">{t('settings.companionSync.group.discovery.open_settings')}</button> : null}
        <button className="rounded-sm px-2 py-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          disabled={props.isBusy} onClick={props.onRecoverDiscovery} type="button">
          {t('settings.companionSync.group.discovery.retry')}
        </button>
      </div>
    </div>
  );
}
