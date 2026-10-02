import { calendarDateKey } from '../../../../lib/core/review/reviewCalendarDates';
import { useLocalization } from '../../../shared/localization/LocalizationProvider';
import { AnnualStatisticsTable, type AnnualStatisticsCell } from '../../../shared/ui/AnnualStatisticsTable';

interface ReviewCalendarTableProps {
  months: Date[];
  today: string;
  counts: (day: string) => { items: number | null; topics: number | null };
}

export function ReviewCalendarTable(props: ReviewCalendarTableProps) {
  const { t, locale } = useLocalization();
  const groups = props.months.map((month) => ({
    key: calendarDateKey(month), year: month.getFullYear(),
    label: month.toLocaleDateString(locale, { month: 'long' }),
    current: props.today.slice(0, 7) === calendarDateKey(month).slice(0, 7)
  }));
  function cell(month: Date, day: number): AnnualStatisticsCell {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const key = calendarDateKey(date);
    const valid = date.getMonth() === month.getMonth();
    if (!valid) return { key: `${calendarDateKey(month)}-${day}`, valid: false, current: false, past: false, label: '', values: [null, null] };
    const value = props.counts(key);
    const label = `${key} · ${t(key < props.today ? 'desktop.reviewCalendar.completed' : 'desktop.reviewCalendar.due')} · ` +
      `Items: ${value.items ?? t('desktop.reviewCalendar.unavailable')} · Topics: ${value.topics ?? t('desktop.reviewCalendar.unavailable')}`;
    return { key, valid, label, current: key === props.today, past: key < props.today, values: [value.items, value.topics] };
  }
  const rows = Array.from({ length: 31 }, (_, index) => ({
    label: String(index + 1).padStart(2, '0'), cells: props.months.map((month) => cell(month, index + 1))
  }));
  return <AnnualStatisticsTable label={t('desktop.reviewCalendar.title')} dayLabel={t('desktop.reviewCalendar.day')}
    groups={groups} rows={rows} metrics={[{ shortLabel: 'It', label: 'Items' }, { shortLabel: 'To', label: 'Topics' }]} />;
}
