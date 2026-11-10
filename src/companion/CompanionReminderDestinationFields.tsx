import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { Dive } from '../../lib/core/nodes/dive';
import type { ReminderRule } from '../../lib/core/reminders/reminderRule';
import { useTranslation } from '../shared/localization/LocalizationProvider';

import { CompanionBottomSheet } from './CompanionBottomSheet';
import { CompanionReminderChoice } from './CompanionReminderChoice';

type Destination = ReminderRule['destination'];

export function CompanionReminderDestinationFields({ destination, dives, disabled, onChange }: {
  destination: Destination;
  dives: readonly Dive[];
  disabled: boolean;
  onChange(destination: Destination): void;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const diveId = typeof destination === 'object' ? destination.diveId : undefined;
  const value = typeof destination === 'object' ? 'dive' : destination ?? 'none';
  const current = dives.find(dive => dive.id === diveId)?.title
    ?? t(diveId ? 'settings.reminders.diveUnavailable' : 'settings.reminders.chooseDive');

  return <div className="border-t border-companion-divider pt-2">
    <CompanionReminderChoice label={t('settings.reminders.onTap')} value={value} disabled={disabled}
      options={{
        none: t('settings.reminders.noDestination'), flow: t('settings.reminders.openFlow'),
        dive: t('settings.reminders.openDiveFlow')
      }}
      disabledValues={dives.length === 0 ? ['dive'] : []}
      onChange={next => {
        if (next === 'dive') onChange({ kind: 'dive', diveId: diveId ?? '' });
        else onChange(next === 'flow' ? next : undefined);
      }} />
    {value === 'dive' && <>
      <button type="button" disabled={disabled || dives.length === 0} aria-haspopup="dialog"
        aria-label={`${t('settings.reminders.dive')} ${current}`}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-base" onClick={() => setOpen(true)}>
        <span className="shrink-0">{t('settings.reminders.dive')}</span>
        <span className="flex min-w-0 items-center gap-2 text-companion-text-secondary">
          <span className="min-w-0 break-words">{current}</span><ChevronRight className="shrink-0" size={16} aria-hidden="true" />
        </span>
      </button>
      <CompanionBottomSheet open={open} onOpenChange={setOpen} title={t('settings.reminders.chooseDive')}>
        {dives.map(dive => <button type="button" key={dive.id} aria-current={dive.id === diveId ? 'true' : undefined}
          className="block min-h-11 w-full break-words border-b border-companion-divider text-left text-base last:border-b-0"
          onClick={() => { onChange({ kind: 'dive', diveId: dive.id }); setOpen(false); }}>{dive.title}</button>)}
      </CompanionBottomSheet>
    </>}
  </div>;
}
