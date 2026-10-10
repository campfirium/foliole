import { useEffect, useState } from 'react';

import { calendarDateKey } from '../../../../lib/core/review/reviewCalendarDates';
import { useLocalization } from '../../../shared/localization/LocalizationProvider';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle, AppStatistic } from '../../../shared/ui';
import { settingsDialogSurfaceClassName } from '../../../shared/ui/SettingsDialogSurface';
import { formatForegroundTime } from '../model/formatForegroundTime';
import { subscribeReviewCalendarOpen } from '../model/reviewCalendarRequests';

import { ReviewCalendarTable } from './ReviewCalendarTable';
import { useForegroundTimeHistory } from './useForegroundTimeHistory';
import { useReviewCalendar } from './useReviewCalendar';

function CalendarContent() {
  const { t, locale } = useLocalization();
  const calendar = useReviewCalendar();
  const first = calendar.months[0]!;
  const last = calendar.months.at(-1)!;
  const time = useForegroundTimeHistory(calendarDateKey(first),
    calendarDateKey(new Date(last.getFullYear(), last.getMonth() + 1, 1)), calendar.today);
  return <AppDialogContent aria-describedby={undefined} onKeyDown={(event) => event.stopPropagation()}
    className={settingsDialogSurfaceClassName('flex h-statistics-panel w-statistics-panel flex-col overflow-hidden')}>
    <header className="flex min-h-14 shrink-0 items-center px-6">
      <AppDialogTitle>{t('desktop.reviewCalendar.title')}</AppDialogTitle>
    </header>
    <div className="min-h-0 flex-1 overflow-auto px-6 pb-5">
      {time.totalDurationMs !== null ? <AppStatistic label={t('desktop.foregroundTime.total')}
        value={formatForegroundTime(time.totalDurationMs, locale)} /> : null}
      {calendar.failed || time.failed ? <div role="alert" className="mb-3 flex items-center gap-2 text-ui-sm text-foreground/76">
        {t(time.failed ? 'desktop.foregroundTime.failed' : 'desktop.reviewCalendar.failed')}<AppButton size="sm" onClick={() => { calendar.retry(); time.retry(); }}>{t('desktop.reviewCalendar.retry')}</AppButton>
      </div> : null}
      <ReviewCalendarTable months={calendar.months} today={calendar.today} counts={calendar.counts} duration={time.duration} />
    </div>
  </AppDialogContent>;
}

export function ReviewCalendarDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => subscribeReviewCalendarOpen(() => setOpen(true)), []);
  return <AppDialog open={open} onOpenChange={setOpen}>
    {open ? <AppDialogPortal><AppDialogOverlay /><CalendarContent /></AppDialogPortal> : null}
  </AppDialog>;
}
