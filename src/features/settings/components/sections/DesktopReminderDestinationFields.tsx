import { ChevronDown } from 'lucide-react';
import { useId } from 'react';

import type { Dive } from '../../../../../lib/core/nodes/dive';
import type { DesktopReminderDraft } from '../../../../../lib/platform/nativeReminderContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  AppDropdownMenu, AppDropdownMenuCheckItem, AppDropdownMenuContent, AppDropdownMenuTrigger,
  SettingsRow, SettingsSegmentedControl, settingsFieldClassName
} from '../../../../shared/ui';

type Destination = DesktopReminderDraft['destination'];
const destinationRow = 'items-center gap-3 max-[1080px]:flex-row max-[1080px]:items-center';

export function DesktopReminderDestinationFields({ destination, dives, pending, onChange }: {
  destination: Destination;
  dives: Dive[];
  pending: boolean;
  onChange(destination: Destination): void;
}) {
  const t = useTranslation();
  const labelId = useId();
  const buttonId = useId();
  const diveId = typeof destination === 'object' ? destination.diveId : null;
  const currentDive = dives.find(dive => dive.id === diveId);

  return <>
    <SettingsRow title={t('settings.reminders.onTap')} className={destinationRow}>
      <SettingsSegmentedControl ariaLabel={t('settings.reminders.onTap')} disabled={pending}
        value={typeof destination === 'object' ? 'dive' : destination ?? 'none'} options={[
          { value: 'none', label: t('settings.reminders.noDestination') },
          { value: 'flow', label: t('settings.reminders.openFlow') },
          { value: 'dive', label: t('settings.reminders.openDiveFlow'), disabled: dives.length === 0 }
        ]} onChange={value => {
          if (value === 'dive') {
            if (diveId === null) onChange({ kind: 'dive', diveId: '' });
          } else onChange(value === 'flow' ? value : undefined);
        }} />
    </SettingsRow>
    {diveId !== null && <SettingsRow className={destinationRow}>
      <span id={labelId} className="text-ui-lg">{t('settings.reminders.dive')}</span>
      <AppDropdownMenu>
        <AppDropdownMenuTrigger asChild>
          <button id={buttonId} aria-labelledby={`${labelId} ${buttonId}`} disabled={pending || dives.length === 0}
            type="button" className={settingsFieldClassName('inline-flex w-auto max-w-64 items-center justify-between gap-2')}>
            <span className="truncate">{currentDive?.title ?? t(diveId ? 'settings.reminders.diveUnavailable' : 'settings.reminders.chooseDive')}</span>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
          </button>
        </AppDropdownMenuTrigger>
        <AppDropdownMenuContent align="end">
          {dives.map(dive => <AppDropdownMenuCheckItem key={dive.id} checked={dive.id === diveId}
            onSelect={() => onChange({ kind: 'dive', diveId: dive.id })}>{dive.title}</AppDropdownMenuCheckItem>)}
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </SettingsRow>}
  </>;
}
