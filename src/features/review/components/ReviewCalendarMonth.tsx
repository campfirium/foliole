import { calendarDateKey, monthLeadingDays } from '../../../../lib/core/review/reviewCalendarDates';
import { useLocalization } from '../../../shared/localization/LocalizationProvider';

interface ReviewCalendarMonthProps {
  month: Date;
  showYear: boolean;
  showLegend: boolean;
  today: string;
  counts: (day: string) => { items: number | null; topics: number | null };
}

export function ReviewCalendarMonth(props: ReviewCalendarMonthProps) {
  const { t, locale } = useLocalization();
  const leading = monthLeadingDays(props.month);
  const length = new Date(props.month.getFullYear(), props.month.getMonth() + 1, 0).getDate();
  const name = props.month.toLocaleDateString(locale, { month: 'long' });
  return (
    <section className="min-w-0" aria-label={`${name} ${props.month.getFullYear()}`}>
      <h3 className="mb-2 flex items-baseline gap-2 text-ui-xl font-medium">
        {name}{props.showYear ? <span className="text-ui-xs font-normal text-foreground/56">{props.month.getFullYear()}</span> : null}
      </h3>
      <div className="review-calendar-weekdays mb-2 grid grid-cols-7 text-ui-xs text-foreground/56" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index}>{new Date(2026, 0, 5 + index).toLocaleDateString(locale, { weekday: 'narrow' })}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: 42 }, (_, index) => {
          if (index < leading || index >= leading + length) {
            return <div key={index} className="review-calendar-cell review-calendar-key text-ui-sm text-foreground/56" aria-hidden="true">
              {index === 0 && props.showLegend ? <><span></span><span>Items</span><span>Topics</span></> : null}
            </div>;
          }
          const date = new Date(props.month.getFullYear(), props.month.getMonth(), index - leading + 1);
          const day = calendarDateKey(date);
          const value = props.counts(day);
          const label = `${day} · ${t(day < props.today ? 'desktop.reviewCalendar.completed' : 'desktop.reviewCalendar.due')} · ` +
            `Items: ${value.items ?? t('desktop.reviewCalendar.unavailable')} · Topics: ${value.topics ?? t('desktop.reviewCalendar.unavailable')}`;
          return <div key={day} className="review-calendar-cell tabular-nums" role="group" aria-label={label} title={label}>
            <span className="text-ui-xl leading-6 text-foreground/88">
              <time dateTime={day} aria-current={day === props.today ? 'date' : undefined}
                className={day === props.today ? 'inline-flex size-6 items-center justify-center rounded-full bg-foreground/88 text-ui-xl text-canvas' : undefined}>
                {date.getDate()}
              </time>
            </span>
            <span className="review-calendar-count text-ui-sm text-foreground/70">{value.items || ''}</span>
            <span className="review-calendar-count text-ui-sm text-foreground/70">{value.topics || ''}</span>
          </div>;
        })}
      </div>
    </section>
  );
}
