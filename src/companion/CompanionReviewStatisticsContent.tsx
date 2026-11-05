import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { calendarDateKey } from '../../lib/core/review/reviewCalendarDates';
import { useForegroundTimeHistory } from '../features/review/components/useForegroundTimeHistory';
import { useReviewCalendar } from '../features/review/components/useReviewCalendar';
import { formatForegroundTime } from '../features/review/model/formatForegroundTime';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { loadCompanionReviewCalendar } from '../shared/platform/companion/runtime/companionReviewCalendar';
import { AppButton, AppIconButton, AppStatistic } from '../shared/ui';

import { CompanionReviewCalendar } from './CompanionReviewCalendar';
import './companionReviewStatistics.css';

export function CompanionReviewStatisticsContent({ libraryScope }: { libraryScope: string }) {
  const { t, locale } = useLocalization();
  const [monthOffset, setMonthOffset] = useState(0);
  const calendar = useReviewCalendar({ monthOffset, libraryScope, load: loadCompanionReviewCalendar });
  const month = calendar.months[0]!;
  const time = useForegroundTimeHistory(calendarDateKey(month),
    calendarDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 1)), calendar.today);
  return <section className="companion-statistics">
    {time.totalDurationMs !== null ? <AppStatistic label={t('desktop.foregroundTime.total')}
      value={formatForegroundTime(time.totalDurationMs, locale)} /> : null}
    <nav className="companion-statistics-month" aria-label={t('desktop.reviewCalendar.title')}>
      <AppIconButton label={t('desktop.foregroundTime.previous')} icon={<ChevronLeft size={16} />}
        onClick={() => setMonthOffset(value => value - 1)} />
      <span>{month.toLocaleDateString(locale, { year: 'numeric', month: 'long' })}</span>
      <AppIconButton label={t('desktop.foregroundTime.next')} icon={<ChevronRight size={16} />}
        onClick={() => setMonthOffset(value => value + 1)} />
    </nav>
    {calendar.failed || time.failed ? <div role="alert" className="companion-statistics-error">
      {t(time.failed ? 'desktop.foregroundTime.failed' : 'desktop.reviewCalendar.failed')}<AppButton size="sm" onClick={() => { calendar.retry(); time.retry(); }}>{t('desktop.reviewCalendar.retry')}</AppButton>
    </div> : null}
    <CompanionReviewCalendar month={month} today={calendar.today} loading={calendar.loading || calendar.failed}
      counts={calendar.counts} duration={time.duration} />
  </section>;
}
