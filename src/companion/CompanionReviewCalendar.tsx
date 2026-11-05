import { calendarDateKey, monthLeadingDays } from '../../lib/core/review/reviewCalendarDates';
import { formatForegroundTime } from '../features/review/model/formatForegroundTime';
import { useLocalization } from '../shared/localization/LocalizationProvider';

interface CalendarProps {
  month: Date;
  today: string;
  loading: boolean;
  duration(day: string): number | null;
  counts(day: string): { topics: number | null; items: number | null };
}

export function CompanionReviewCalendar(props: CalendarProps) {
  const { t, locale } = useLocalization();
  const leading = monthLeadingDays(props.month);
  const length = new Date(props.month.getFullYear(), props.month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((leading + length) / 7) * 7 }, (_, index) => {
    const day = index - leading + 1;
    if (day < 1 || day > length) return index === 0 && leading > 0
      ? <td key={index}><div className="companion-statistics-cell companion-statistics-guide">
        <span>{t('companion.statistics.date')}</span><span>{t('settings.icons.node.topic')}</span><span>{t('settings.icons.node.item')}</span><span>{t('desktop.foregroundTime.short')}</span>
      </div></td> : <td key={index} />;
    const key = calendarDateKey(new Date(props.month.getFullYear(), props.month.getMonth(), day));
    const count = props.counts(key);
    const duration = props.duration(key);
    const unavailable = t('desktop.reviewCalendar.unavailable');
    const label = `${key} · ${t(key < props.today ? 'desktop.reviewCalendar.completed' : 'desktop.reviewCalendar.due')}` +
      ` · ${t('settings.icons.node.topic')}: ${count.topics ?? unavailable} · ${t('settings.icons.node.item')}: ${count.items ?? unavailable}` +
      ` · ${t('desktop.foregroundTime.title')}: ${formatForegroundTime(duration, locale) || unavailable}`;
    const display = (value: number | null) => props.loading || value === null || value === 0 ? '' : value.toLocaleString(locale);
    return <td key={key}><div role="group" aria-label={label} aria-current={key === props.today ? 'date' : undefined}
      title={label} className="companion-statistics-cell">
      <time dateTime={key}>{day}</time><span>{display(count.topics)}</span><span>{display(count.items)}</span>
      <span>{duration === null || duration < 60_000 ? '' : Math.floor(duration / 60_000).toLocaleString(locale)}</span>
    </div></td>;
  });
  return <table className="companion-statistics-calendar" aria-label={t('desktop.reviewCalendar.title')} aria-busy={props.loading}>
    <thead><tr>{Array.from({ length: 7 }, (_, index) => <th scope="col" key={index}>
      {new Date(2024, 0, index + 1).toLocaleDateString(locale, { weekday: 'short' })}
    </th>)}</tr></thead>
    <tbody>{Array.from({ length: cells.length / 7 }, (_, index) => <tr key={index}>{cells.slice(index * 7, index * 7 + 7)}</tr>)}</tbody>
  </table>;
}
