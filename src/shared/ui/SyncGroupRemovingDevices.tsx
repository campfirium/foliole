import type { SyncGroupRemovingEntry } from '../../../lib/platform/syncGroupRemovalModel';
import { useTranslation } from '../localization/LocalizationProvider';

/** Renders list items; mount inside the group's device list so they share its indent and dividers. */
export function SyncGroupRemovingDevices(props: { entries: SyncGroupRemovingEntry[]; requiredCount: number }) {
  const t = useTranslation();
  return (
    <>
      {props.entries.map(entry => (
        <div className="flex min-h-14 items-center justify-between gap-7 py-2.5 text-muted-foreground" role="listitem"
          key={entry.target.device_identity_key}
          title={`${t('settings.companionSync.group.removing.confirmed')}: ${
            entry.confirmed_devices.map(device => device.device_name).join(', ')}`}>
          <span className="truncate text-ui-md">{entry.target.device_name}</span>
          <span className="shrink-0 text-ui-sm">
            {t('settings.companionSync.group.removing.progress',
              { confirmed: entry.confirmed_devices.length, total: props.requiredCount })}
          </span>
        </div>
      ))}
    </>
  );
}
