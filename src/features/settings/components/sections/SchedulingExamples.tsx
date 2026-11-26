import { useMemo, type ReactNode } from 'react';

import { useLocalization } from '../../../../shared/localization/LocalizationProvider';
import { resolveNextReadingIntervalDurationMs } from '../../../review/model/unifiedPushQueueRules';
import { simulateReviewLoadExample } from '../../model/simulateReviewLoadExample';

export function SchedulingExample({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 gap-2 px-settings-panel-x pb-settings-panel-y text-ui-md leading-6 text-foreground/64">
    {children}
  </div>;
}

export function RetentionLoadExample() {
  const { locale, t } = useLocalization();
  const examples = useMemo(simulateReviewLoadExample, []);
  const percent = new Intl.NumberFormat(locale, { style: 'percent' });
  const integer = new Intl.NumberFormat(locale);
  const list = new Intl.ListFormat(locale);

  return <SchedulingExample>
    <p>{t('settings.scheduling.retentionExample', {
      targets: list.format(examples.map(({ retention }) => percent.format(retention))),
      reviews: list.format(examples.map(({ reviews }) => integer.format(reviews)))
    })}</p>
  </SchedulingExample>;
}

export function ReviewMixExample({ reading, fsrs }: { reading: number; fsrs: number }) {
  const { locale, t } = useLocalization();
  const integer = new Intl.NumberFormat(locale);
  const reviews = t(fsrs === 1 ? 'settings.scheduling.mixItems.one' : 'settings.scheduling.mixItems.other', { count: integer.format(fsrs) });
  const topics = t(reading === 1 ? 'settings.scheduling.mixTopics.one' : 'settings.scheduling.mixTopics.other', { count: integer.format(reading) });

  return <SchedulingExample><p>{t('settings.scheduling.mixExample', { reviews, topics })}</p></SchedulingExample>;
}

export function ReadingGrowthDescription({ description, min, max, minimumIntervalMs }: {
  description: string;
  min: number;
  max: number;
  minimumIntervalMs: number;
}) {
  const { locale, t } = useLocalization();
  const dayMs = 86_400_000;
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const daysAt = (priority: number) => format.format(resolveNextReadingIntervalDurationMs({
    repetitionCount: 1,
    previousIntervalDurationMs: 10 * dayMs,
    priorityChain: [priority],
    minimumIntervalMs,
    range: { min, max }
  }) / dayMs);

  return <>{description}
    <span className="mt-2 block">{t('settings.scheduling.readingGrowthExample', {
      p1: daysAt(1), p9: daysAt(9)
    })}</span>
  </>;
}
