import { useState } from 'react';

import { calendarDateKey, reviewCalendarDayKey } from '../../lib/core/review/reviewCalendarDates';
import { useForegroundTimeHistory } from '../features/review/components/useForegroundTimeHistory';
import { formatForegroundTime } from '../features/review/model/formatForegroundTime';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { useLocalization } from '../shared/localization/LocalizationProvider';
import { AppButton } from '../shared/ui';

export function CompanionForegroundTimeContent() {
  const { t, locale } = useLocalization();
  const today = reviewCalendarDayKey(new Date(), getCurrentReviewSchedulerSettings().newDayStartsAtHour);
  const [month, setMonth] = useState(() => new Date(`${today}T12:00:00`));
  const from = calendarDateKey(new Date(month.getFullYear(), month.getMonth(), 1));
  const to = calendarDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const history = useForegroundTimeHistory(from, to, today);
  const length = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from({ length }, (_, index) => calendarDateKey(new Date(month.getFullYear(), month.getMonth(), index + 1)))
    .filter((day) => day <= today).reverse();
  const change = (delta: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  return <div className="px-4 py-3">
    <div className="mb-4 flex items-center justify-between gap-2">
      <AppButton size="sm" onClick={() => change(-1)} aria-label={t('desktop.foregroundTime.previous')}>‹</AppButton>
      <span>{month.toLocaleDateString(locale, { year: 'numeric', month: 'long' })}</span>
      <AppButton size="sm" onClick={() => change(1)} disabled={to > today}
        aria-label={t('desktop.foregroundTime.next')}>›</AppButton>
    </div>
    {history.failed ? <div role="alert" className="mb-3 text-ui-sm">
      {t('desktop.foregroundTime.failed')}<AppButton onClick={history.retry}>{t('desktop.reviewCalendar.retry')}</AppButton>
    </div> : null}
    <dl>{days.map((day) => <div key={day} className="flex justify-between border-b border-foreground/10 py-3 tabular-nums">
      <dt>{day}</dt><dd>{formatForegroundTime(history.duration(day), locale) || t('desktop.reviewCalendar.unavailable')}</dd>
    </div>)}</dl>
  </div>;
}
