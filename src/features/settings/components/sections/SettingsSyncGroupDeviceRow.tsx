import type { SyncGroupDevicePayload, SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import { displaySyncGroupPlatform } from '../../../../../lib/platform/syncGroupPlatform';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';

export function SettingsSyncGroupDeviceRow(props: {
  device: SyncGroupDevicePayload;
  disabled: boolean;
  group: SyncGroupPayload;
  onRemove(device: SyncGroupDevicePayload): void;
  onTogglePause(): void;
  removing: boolean;
  syncEnabled: boolean;
  syncPaused: boolean;
  topologyLabel: string | undefined;
}) {
  const t = useTranslation();
  const local = props.device.device_identity_key === props.group.local_device_identity_key;
  if (local && !props.syncEnabled) {
    return (
      <div className="flex min-h-16 items-center justify-between gap-7 py-3.5" role="listitem">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-ui-md font-normal text-foreground">{props.device.device_name}</span>
          <span className="shrink-0 text-ui-sm text-muted-foreground">{displaySyncGroupPlatform(props.device.platform)}</span>
        </div>
        <span className="shrink-0 text-ui-sm text-muted-foreground">
          {t('settings.companionSync.group.sync.off')}
        </span>
      </div>
    );
  }
  const label = local && props.topologyLabel
    ? props.topologyLabel
    : local
      ? t(props.syncPaused ? 'settings.companionSync.group.resume' : 'settings.companionSync.group.pause')
      : t(props.removing ? 'settings.companionSync.group.remove.pending' : 'settings.companionSync.group.remove');
  return (
    <div className="flex min-h-16 items-center justify-between gap-7 py-3.5" role="listitem">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-ui-md font-normal text-foreground">{props.device.device_name}</span>
        <span className="shrink-0 text-ui-sm text-muted-foreground">
          {displaySyncGroupPlatform(props.device.platform)}
        </span>
      </div>
      <button
        className="shrink-0 rounded-sm px-2 py-1 text-ui-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-45"
        disabled={props.disabled || props.removing}
        onClick={() => local ? props.onTogglePause() : props.onRemove(props.device)}
        type="button"
      >
        {label}
      </button>
    </div>
  );
}
