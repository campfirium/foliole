import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { monthLeadingDays } from '../../../../lib/core/review/reviewCalendarDates';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle, AppIconButton } from '../../../shared/ui';
import { AppDialogTrigger } from '../../../shared/ui/Dialog';
import { settingsDialogSurfaceClassName } from '../../../shared/ui/SettingsDialogSurface';

import { ReviewCalendarMonth } from './ReviewCalendarMonth';
import { useReviewCalendar } from './useReviewCalendar';
import './reviewCalendar.css';

function CalendarContent() {
  const t = useTranslation();
  const calendar = useReviewCalendar();
  const [page, setPage] = useState(0);
  const months = calendar.months.slice(page * 6, page * 6 + 6);
  const legend = months.findIndex((month) => monthLeadingDays(month) > 0);
  return <AppDialogContent aria-describedby={undefined}
    className={settingsDialogSurfaceClassName('review-calendar-panel flex flex-col overflow-hidden')}>
    <header className="flex min-h-16 shrink-0 items-center justify-between px-8">
      <AppDialogTitle>{t('desktop.reviewCalendar.title')}</AppDialogTitle>
      <div className="flex gap-3">
        <AppIconButton icon={<ChevronLeft size={16} />} label={t('desktop.reviewCalendar.previous')}
          disabled={page === 0} onClick={() => setPage(0)} />
        <AppIconButton icon={<ChevronRight size={16} />} label={t('desktop.reviewCalendar.next')}
          disabled={page === 1} onClick={() => setPage(1)} />
      </div>
    </header>
    <div className="min-h-0 flex-1 overflow-auto px-8 pb-8">
      {calendar.failed ? <div role="alert" className="mb-3 flex items-center gap-2 text-ui-sm text-foreground/76">
        {t('desktop.reviewCalendar.failed')}<AppButton size="sm" onClick={calendar.retry}>{t('desktop.reviewCalendar.retry')}</AppButton>
      </div> : null}
      <div className="review-calendar-months grid gap-x-10 gap-y-6">
        {months.map((month, index) => <ReviewCalendarMonth key={month.toISOString()} month={month}
          showYear={index === 0 || month.getMonth() === 0} showLegend={index === legend}
          today={calendar.today} counts={calendar.counts} />)}
      </div>
    </div>
  </AppDialogContent>;
}

export function ReviewCalendarDialog() {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  return <AppDialog open={open} onOpenChange={setOpen}>
    <AppDialogTrigger asChild><AppIconButton icon={<CalendarDays size={16} />} label={t('desktop.reviewCalendar.title')} /></AppDialogTrigger>
    {open ? <AppDialogPortal><AppDialogOverlay /><CalendarContent /></AppDialogPortal> : null}
  </AppDialog>;
}
