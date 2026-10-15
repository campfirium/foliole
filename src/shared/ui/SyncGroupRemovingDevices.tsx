import type { SyncGroupRemovingEntry } from '../../../lib/platform/syncGroupRemovalModel';
import { useTranslation } from '../localization/LocalizationProvider';

export function SyncGroupRemovingDevices(props: { entries: SyncGroupRemovingEntry[] }) {
  const t = useTranslation();
  if (!props.entries.length) return null;
  return (
    <table className="mt-5 w-full table-fixed border-t border-settings-divider/65 text-left text-ui-sm">
      <caption className="sr-only">{t('settings.companionSync.group.removing.title')}</caption>
      <thead>
        <tr className="text-muted-foreground">
          <th className="py-3 pr-5 font-normal" scope="col">{t('settings.companionSync.group.removing.title')}</th>
          <th className="py-3 font-normal" scope="col">{t('settings.companionSync.group.removing.confirmed')}</th>
        </tr>
      </thead>
      <tbody>
        {props.entries.map(entry => (
          <tr className="border-t border-settings-divider/65 align-top" key={entry.target.device_identity_key}>
            <th className="break-words py-3 pr-5 font-normal" scope="row">{entry.target.device_name}</th>
            <td className="break-words py-3">{entry.confirmed_devices.map(device => device.device_name).join(', ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
