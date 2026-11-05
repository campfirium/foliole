import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { ReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppDialog, AppDialogTrigger } from '../shared/ui/Dialog';

import { CompanionLearningSettingDialog } from './CompanionLearningSettingDialog';
import { formatLearningRowValue, type CompanionLearningSettingRow } from './companionLearningSettingRows';

export function CompanionLearningSettingControl(props: { row: CompanionLearningSettingRow; settings: ReviewSchedulerSettings }) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  return <AppDialog open={open} onOpenChange={setOpen}>
    <AppDialogTrigger asChild>
      <button className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-companion-divider py-3 text-left active:bg-companion-subtle/80"
        type="button">
        <span data-settings-value-title className="text-ui-lg font-normal text-foreground">{t(props.row.title)}</span>
        <span className="flex shrink-0 items-center gap-2 text-base tabular-nums text-companion-text-secondary">
          {formatLearningRowValue(props.row, props.settings, t('settings.review.rangeTo'))}
          <ChevronRight aria-hidden="true" size={16} />
        </span>
      </button>
    </AppDialogTrigger>
    {open ? <CompanionLearningSettingDialog onClose={() => setOpen(false)} row={props.row} settings={props.settings} /> : null}
  </AppDialog>;
}
