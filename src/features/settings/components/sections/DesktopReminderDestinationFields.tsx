import type { Dive } from '../../../../../lib/core/nodes/dive';
import type { DesktopReminderDraft } from '../../../../../lib/platform/nativeReminderContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { settingsFieldClassName } from '../../../../shared/ui';

type Destination = DesktopReminderDraft['destination'];

export function DesktopReminderDestinationFields({ destination, dives, pending, onChange }: {
  destination: Destination;
  dives: Dive[];
  pending: boolean;
  onChange(destination: Destination): void;
}) {
  const t = useTranslation();
  const diveId = typeof destination === 'object' ? destination.diveId : null;
  const currentDive = dives.find(dive => dive.id === diveId);

  return <>
    <select aria-label={t('settings.reminders.onTap')} className={settingsFieldClassName('col-start-3')} disabled={pending}
      value={typeof destination === 'object' ? 'dive' : destination ?? 'none'} onChange={event => {
        const value = event.currentTarget.value;
        if (value === 'dive') onChange({ kind: 'dive', diveId: '' });
        else onChange(value === 'flow' ? value : undefined);
      }}>
      <option value="none">{t('settings.reminders.notifyOnly')}</option>
      <option value="flow">{t('settings.reminders.openFlow')}</option>
      <option value="dive" disabled={dives.length === 0}>{t('settings.reminders.openDiveFlow')}</option>
    </select>
    {diveId !== null && <select aria-label={t('settings.reminders.dive')} className={settingsFieldClassName('col-start-4')}
      disabled={pending || dives.length === 0} value={diveId}
      onChange={event => onChange({ kind: 'dive', diveId: event.currentTarget.value })}>
      <option value="" disabled>{t('settings.reminders.chooseDive')}</option>
      {diveId && !currentDive && <option value={diveId} disabled>{t('settings.reminders.diveUnavailable')}</option>}
      {dives.map(dive => <option key={dive.id} value={dive.id}>{dive.title}</option>)}
    </select>}
  </>;
}
