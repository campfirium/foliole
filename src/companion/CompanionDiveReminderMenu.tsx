import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';

import type { Dive } from '../../lib/core/nodes/dive';
import { useReminderDraftRequest } from '../features/settings/context/ReminderDraftRequest';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { isNativeCompanionRuntime } from '../shared/platform/companionBootstrap';

import { CompanionBottomSheet } from './CompanionBottomSheet';

export function CompanionDiveReminderMenu({ dive }: { dive: Dive }) {
  const t = useTranslation();
  const request = useReminderDraftRequest();
  const [open, setOpen] = useState(false);
  if (!request || !isNativeCompanionRuntime()) return null;

  return <>
    <button type="button" aria-haspopup="dialog" aria-label={`${t('companion.browse.more')}: ${dive.title}`}
      className="ml-auto flex size-11 shrink-0 items-center justify-center text-companion-text-secondary"
      onClick={() => setOpen(true)}><MoreHorizontal size={16} aria-hidden="true" /></button>
    <CompanionBottomSheet title={t('companion.browse.more')} open={open} onOpenChange={setOpen}>
      <button type="button" className="block min-h-11 w-full text-left text-base"
        onClick={() => { setOpen(false); request.createForDive(dive); }}>
        {t('settings.reminders.createForDive')}
      </button>
    </CompanionBottomSheet>
  </>;
}
