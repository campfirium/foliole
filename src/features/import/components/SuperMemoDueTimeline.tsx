import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

import { superMemoDueWeekDates } from '../../../../lib/core/import/superMemoDueDistribution';
import { useLocalization, useTranslation } from '../../../shared/localization/LocalizationProvider';

import { DUE_PLOT_HEIGHT, DUE_PLOT_WIDTH, dueTimelineWidth, type makeDuePlot } from './superMemoDueChartGeometry';

type Plot = ReturnType<typeof makeDuePlot>;

function barPath(counts: Map<number, number>, plot: Plot, spacing: Map<number, number>, original: boolean) {
  return [...counts].map(([bucket, count]) => {
    const { left, width } = plot.bar(bucket, original, spacing.get(bucket));
    return `M${left},${DUE_PLOT_HEIGHT}V${plot.y(count)}h${width}V${DUE_PLOT_HEIGHT}Z`;
  }).join('');
}

function nextOccupiedPeriod(key: string, selected: number, first: number, last: number, occupied: Iterable<number>) {
  if (key === 'Home') return first;
  if (key === 'End') return last;
  if (key === 'ArrowLeft') {
    let previous = first;
    for (const bucket of occupied) if (bucket < selected) previous = Math.max(previous, bucket);
    return previous;
  }
  if (key === 'ArrowRight') {
    let next = last;
    for (const bucket of occupied) if (bucket > selected) next = Math.min(next, bucket);
    return next;
  }
  return null;
}

function CalendarTicks({ first, last, startDate, plot, viewport }: {
  first: number; last: number; startDate: string; plot: Plot; viewport: RefObject<HTMLDivElement | null>;
}) {
  const { locale } = useLocalization();
  const labels = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!viewport.current || !labels.current) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) entry.target.toggleAttribute('data-fully-visible', entry.intersectionRatio === 1);
    }, { root: viewport.current, threshold: 1 });
    for (const label of labels.current.children) observer.observe(label);
    return () => observer.disconnect();
  }, [first, last, locale, plot, startDate, viewport]);

  const monthly = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const yearly = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', timeZone: 'UTC' });
  const ticks = [];
  let previousMonth = '';
  for (let bucket = first; bucket <= last; bucket += 1) {
    const month = (bucket === first ? startDate : superMemoDueWeekDates(bucket).start).slice(0, 7);
    if (month === previousMonth) continue;
    const january = month.endsWith('-01');
    const date = new Date(`${month}-01T00:00:00Z`);
    ticks.push({ bucket, label: (january ? yearly : monthly).format(date) });
    previousMonth = month;
  }
  return (
    <div ref={labels} aria-hidden="true" className="relative h-6 whitespace-nowrap pt-1 text-foreground/65">
      {ticks.map(({ bucket, label }) => (
        <span key={bucket} className="invisible absolute -translate-x-1/2 data-[fully-visible]:visible"
          style={{ left: `${plot.periodCenter(bucket) / DUE_PLOT_WIDTH * 100}%` }}>
          {label}
        </span>
      ))}
    </div>
  );
}

function WeekTooltip({ bucket, first, startDate, original, planned, anchor }: {
  bucket: number; first: number; startDate: string; original: number; planned: number; anchor: number;
}) {
  const t = useTranslation();
  const dates = superMemoDueWeekDates(bucket);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1" role="status">
      <div className="relative grid w-48 max-w-full gap-1 rounded-md border border-settings-divider bg-[var(--app-tooltip-bg)] px-3 py-2 [box-shadow:var(--shadow-panel)]"
        style={{ left: `clamp(0px, ${anchor - 96}px, calc(100% - 12rem))` }}>
        <span className="font-medium">{bucket === first ? startDate : dates.start} – {dates.end}</span>
        <span className="flex justify-between gap-2">SuperMemo <strong>{original.toLocaleString()}</strong></span>
        <span className="flex justify-between gap-2">
          {t('desktop.superMemoDrafts.scheduleChartCurrent')} <strong>{planned.toLocaleString()}</strong>
        </span>
      </div>
    </div>
  );
}

function revealPeriod(viewport: HTMLDivElement, width: number, bucket: number, plot: Plot) {
  const left = viewport.scrollLeft;
  const right = left + viewport.clientWidth;
  const center = plot.periodCenter(bucket) / DUE_PLOT_WIDTH * width;
  if (center < left + 12) viewport.scrollLeft = Math.max(0, center - 12);
  else if (center > right - 12) viewport.scrollLeft = center + 12 - viewport.clientWidth;
}

export function SuperMemoDueTimeline({ first, last, startDate, original, plot, planned, spacing }: {
  first: number; last: number; startDate: string;
  original: Map<number, number>;
  plot: Plot;
  planned: Map<number, number>;
  spacing: Map<number, number>;
}) {
  const t = useTranslation();
  const viewport = useRef<HTMLDivElement>(null);
  const visibleWeeks = useMemo(() => new Set([...original.keys(), ...planned.keys()]), [original, planned]);
  const [active, setActive] = useState<{ bucket: number; width: number } | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const originalPath = useMemo(() => barPath(original, plot, spacing, true), [original, plot, spacing]);
  const plannedPath = useMemo(() => barPath(planned, plot, spacing, false), [planned, plot, spacing]);

  function selectPeriod(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const bucket = plot.periodAt((event.clientX - bounds.left) / bounds.width * DUE_PLOT_WIDTH);
    setActive(current => current?.bucket === bucket && current.width === bounds.width ? current : { bucket, width: bounds.width });
  }

  function movePeriod(event: KeyboardEvent<SVGSVGElement>) {
    const next = nextOccupiedPeriod(event.key, active?.bucket ?? first, first, last, visibleWeeks);
    if (next === null) return;
    event.preventDefault();
    setActive({ bucket: next, width: event.currentTarget.clientWidth });
    const scroller = viewport.current;
    if (!scroller) return;
    if (next === first) scroller.scrollLeft = 0;
    else if (next === last) scroller.scrollLeft = scroller.scrollWidth - scroller.clientWidth;
    else revealPeriod(scroller, event.currentTarget.clientWidth, next, plot);
  }

  return (
    <div className="relative min-w-0 pl-9">
      <div aria-hidden="true" className="absolute left-0 bottom-6 top-0 w-8 text-right text-foreground/65">
        {plot.ticks.map(value => <span key={value} className="absolute right-0 -translate-y-1/2"
          style={{ top: `${plot.y(value) / DUE_PLOT_HEIGHT * 100}%` }}>{value}</span>)}
      </div>
      <div ref={viewport} role="region" aria-label={t('desktop.superMemoDrafts.scheduleChartTimeline')}
        className="h-full w-full min-w-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none]" onScroll={event => setScrollLeft(event.currentTarget.scrollLeft)}>
        <div className="grid h-full grid-rows-[minmax(0,1fr)_auto]" style={dueTimelineWidth(last - first + 1)}>
          <svg className="block h-full min-h-0 w-full rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--role-accent)]"
            viewBox={`0 0 ${DUE_PLOT_WIDTH} ${DUE_PLOT_HEIGHT}`} preserveAspectRatio="none" tabIndex={0} role="group"
            aria-label={t('desktop.superMemoDrafts.scheduleChartWeek')}
            onPointerMove={selectPeriod} onPointerDown={selectPeriod} onPointerLeave={() => setActive(null)}
            onBlur={() => setActive(null)} onKeyDown={movePeriod}>
            {plot.ticks.map(value => <path key={value} d={`M0,${plot.y(value)}H${DUE_PLOT_WIDTH}`}
              vectorEffect="non-scaling-stroke" className="stroke-[var(--role-content-line)]" />)}
            <path d={originalPath} className="fill-[#ead398] dark:fill-[#cbb075]" />
            <path d={plannedPath} className="fill-[#78ab98] dark:fill-[#6c9f8d]" />
          </svg>
          <CalendarTicks first={first} last={last} startDate={startDate} plot={plot} viewport={viewport} />
        </div>
      </div>
      {active ? <div className="pointer-events-none absolute inset-x-0 left-9 top-0">
        <WeekTooltip bucket={active.bucket} first={first} startDate={startDate}
          original={original.get(active.bucket) ?? 0} planned={planned.get(active.bucket) ?? 0}
          anchor={plot.periodCenter(active.bucket) / DUE_PLOT_WIDTH * active.width - scrollLeft} />
      </div> : null}
    </div>
  );
}
