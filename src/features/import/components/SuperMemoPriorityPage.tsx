import type { ReactNode } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { PriorityQueueExplanation } from '../../review/components/PriorityQueueExplanation';
import { useReviewSchedulerSettings } from '../../settings/context/ReviewSchedulerSettingsProvider';

import { SuperMemoPriorityScale } from './SuperMemoPriorityScale';

function PriorityRule({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-x-3 gap-y-1 [@media(min-width:940px)]:grid-cols-[130px_minmax(0,1fr)]">
    <dt className="font-semibold">{label}</dt>
    <dd className="grid min-w-0 gap-2 text-foreground/75">{children}</dd>
  </div>;
}

export function SuperMemoPriorityPage({ boundaries, paired, busy, onChange }: {
  boundaries: readonly number[]; paired: boolean; busy: boolean; onChange(value: readonly number[]): void;
}) {
  const t = useTranslation();
  const { reviewSchedulerSettings } = useReviewSchedulerSettings();
  return <div className="grid min-w-0 gap-5 text-sm leading-relaxed">
    <section className="grid gap-2" aria-labelledby="supermemo-priority-source">
      <h4 id="supermemo-priority-source" className="text-base font-semibold">SuperMemo</h4>
      <dl className="grid gap-3">
        <PriorityRule label={t('desktop.superMemoDrafts.priorityLearningOrder')}>
          <p>{t('desktop.superMemoDrafts.prioritySourceOrder')}</p>
        </PriorityRule>
        <PriorityRule label={t('desktop.superMemoDrafts.priorityReadingIntervals')}>
          <p>{t('desktop.superMemoDrafts.prioritySourceIntervals')}</p>
        </PriorityRule>
      </dl>
    </section>
    <section className="grid gap-2 border-y border-settings-divider/65 pt-2.5" aria-label={t('desktop.superMemoDrafts.priorityStep')}>
      <SuperMemoPriorityScale boundaries={boundaries} disabled={busy || !paired} onChange={onChange} />
      {!paired && !busy ? <p className="pb-2 text-xs text-foreground/65">{t('desktop.superMemoDrafts.priorityNeedsCollection')}</p> : null}
    </section>
    <section className="grid gap-2" aria-labelledby="supermemo-priority-target">
      <h4 id="supermemo-priority-target" className="text-base font-semibold">Foliole</h4>
      <dl className="grid gap-3">
        <PriorityRule label={t('desktop.superMemoDrafts.priorityLearningOrder')}>
          <PriorityQueueExplanation ratio={reviewSchedulerSettings.pushQueue.priorityRatio} />
        </PriorityRule>
        <PriorityRule label={t('desktop.superMemoDrafts.priorityReadingIntervals')}>
          <p>{t('desktop.superMemoDrafts.priorityTargetIntervals')}</p>
        </PriorityRule>
        <PriorityRule label={t('desktop.superMemoDrafts.priorityManaging')}>
          <p>{t('desktop.superMemoDrafts.priorityInheritance')}</p>
        </PriorityRule>
      </dl>
    </section>
  </div>;
}
