import { useMemo } from 'react';

import {
  type SuperMemoDueDistribution, type SuperMemoDueProjection
} from '../../../../lib/core/import/superMemoDueDistribution';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

import { makeDuePlot, nearestDuePeriodDistances } from './superMemoDueChartGeometry';
import { SuperMemoDueTimeline } from './SuperMemoDueTimeline';

function ScheduleSwatch({ original }: { original?: boolean }) {
  const color = original ? 'bg-[#ead398] dark:bg-[#cbb075]' : 'bg-[#78ab98] dark:bg-[#6c9f8d]';
  return <i aria-hidden="true" className={`size-2.5 shrink-0 rounded-sm ${color}`} />;
}

function DueCounts({ original, planned }: { original: number; planned: number }) {
  const t = useTranslation();
  const title = t('desktop.superMemoDrafts.scheduleChartDue');
  const delta = planned - original;
  const change = delta === 0 ? null : `（${delta < 0 ? '−' : '+'}${Math.abs(delta).toLocaleString()}）`;

  return (
    <section aria-label={title}
      className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
      <h4 className="font-semibold">{title}</h4>
      <dl className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <div className="flex items-baseline gap-1.5">
          <dt className="flex items-center gap-1.5"><ScheduleSwatch original />SuperMemo</dt>
          <dd className="font-semibold">{original.toLocaleString()}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="flex items-center gap-1.5">
            <span aria-hidden="true" className="mr-0.5 text-foreground/65">→</span>
            <ScheduleSwatch />{t('desktop.superMemoDrafts.scheduleChartCurrent')}
          </dt>
          <dd className="flex items-baseline" aria-live="polite">
            <strong className="font-semibold">{planned.toLocaleString()}</strong>
            {change ? <span className="text-foreground/65">{change}</span> : null}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function FutureChart({ data, planned }: { data: SuperMemoDueDistribution; planned: SuperMemoDueProjection }) {
  const t = useTranslation();
  const title = t('desktop.superMemoDrafts.scheduleChartWeekly');
  const { firstWeek: first, lastWeek: last, maxCount } = data;
  const original = data.original.counts;
  const adjusted = planned.counts;
  const spacing = useMemo(() => nearestDuePeriodDistances([...data.occupiedWeeks]), [data.occupiedWeeks]);
  const showFuture = original.size > 0 || adjusted.size > 0;
  const plot = useMemo(() => showFuture ? makeDuePlot(first, last, maxCount) : null, [first, last, maxCount, showFuture]);
  return (
    <section aria-label={title} className={`grid min-h-0 min-w-0 gap-2 ${plot ? 'grid-rows-[auto_minmax(0,1fr)]' : 'content-start'}`}>
      <h4 className="font-semibold">{title}</h4>
      {plot ? <SuperMemoDueTimeline first={first} last={last} startDate={data.startDate} original={original} plot={plot}
        planned={adjusted} spacing={spacing} /> : <p className="text-foreground/65">{t('desktop.superMemoDrafts.scheduleChartEmpty')}</p>}
    </section>
  );
}

function ScheduleExplanation() {
  const t = useTranslation();
  return (
    <div className="grid gap-2 text-foreground/65">
      <dl className="grid gap-1.5">
        <div className="flex items-baseline gap-2">
          <ScheduleSwatch original />
          <dt className="font-medium text-foreground">SuperMemo</dt>
          <dd>{t('desktop.superMemoDrafts.scheduleChartOriginalHelp')}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <ScheduleSwatch />
          <dt className="shrink-0 font-medium text-foreground">{t('desktop.superMemoDrafts.scheduleChartCurrent')}</dt>
          <dd>{t('desktop.superMemoDrafts.scheduleChartCurrentHelp')}</dd>
        </div>
      </dl>
      <p className="mt-2 whitespace-pre-line">{t('desktop.superMemoDrafts.scheduleChartFirstReviewOnly')}</p>
    </div>
  );
}

export function SuperMemoDueChart({ data, percent }: { data: SuperMemoDueDistribution; percent: number }) {
  const planned = useMemo(() => data.planned(percent), [data, percent]);
  return (
    <div className={`grid min-h-0 min-w-0 flex-1 gap-5 text-sm tabular-nums ${
      data.maxCount > 0 ? 'grid-rows-[auto_minmax(8rem,1fr)_auto]' : 'content-between'
    }`}>
      <DueCounts original={data.original.dueCount} planned={planned.dueCount} />
      <FutureChart data={data} planned={planned} />
      <ScheduleExplanation />
    </div>
  );
}
