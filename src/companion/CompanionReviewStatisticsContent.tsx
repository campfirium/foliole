import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { useReviewCalendar } from '../features/review/components/useReviewCalendar';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { loadCompanionReviewCalendar } from '../shared/platform/companion/runtime/companionReviewCalendar';
import { AppButton, AppIconButton } from '../shared/ui';

import { CompanionReviewCalendar } from './CompanionReviewCalendar';
import './companionReviewStatistics.css';

export function CompanionReviewStatisticsContent({ libraryScope }: { libraryScope: string }) {
  const { t, locale } = useLocalization();
  const [monthOffset, setMonthOffset] = useState(0);
  const calendar = useReviewCalendar({ monthOffset, libraryScope, load: loadCompanionReviewCalendar });
  const month = calendar.months[0]!;
  return <section className="companion-statistics">
    <nav className="companion-statistics-month" aria-label={t('desktop.reviewCalendar.title')}>
      <AppIconButton label={t('desktop.foregroundTime.previous')} icon={<ChevronLeft size={16} />}
        onClick={() => setMonthOffset(value => value - 1)} />
      <span>{month.toLocaleDateString(locale, { year: 'numeric', month: 'long' })}</span>
      <AppIconButton label={t('desktop.foregroundTime.next')} icon={<ChevronRight size={16} />}
        onClick={() => setMonthOffset(value => value + 1)} />
    </nav>
    {calendar.failed ? <div role="alert" className="companion-statistics-error">
      {t('desktop.reviewCalendar.failed')}<AppButton size="sm" onClick={calendar.retry}>{t('desktop.reviewCalendar.retry')}</AppButton>
    </div> : null}
    <CompanionReviewCalendar month={month} today={calendar.today} loading={calendar.loading || calendar.failed}
      counts={calendar.counts} />
  </section>;
}
