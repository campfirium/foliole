import type { ReactNode } from 'react';

import { REGULAR_PUSH_QUEUE_PRIORITIES } from '../../../../lib/core/review/unifiedPushQueueRules';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

import { SuperMemoPriorityScale } from './SuperMemoPriorityScale';

const probabilities = ['17.6%', '16.2%', '14.7%', '13.1%', '11.5%', '9.7%', '7.9%', '5.9%', '3.5%'];

function PriorityRule({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid gap-x-3 gap-y-1 [@media(min-width:940px)]:grid-cols-[130px_minmax(0,1fr)]">
    <dt className="font-semibold">{label}</dt>
    <dd className="grid min-w-0 gap-2 text-foreground/75">{children}</dd>
  </div>;
}

function PriorityProbabilities() {
  return <div className="overflow-x-auto">
    <table aria-labelledby="supermemo-priority-probabilities" className="w-full min-w-[290px] table-fixed text-center text-xs tabular-nums">
      <thead><tr>{REGULAR_PUSH_QUEUE_PRIORITIES.map(priority =>
        <th key={priority} scope="col" className="border-b border-settings-divider py-1 font-semibold text-foreground">P{priority}</th>
      )}</tr></thead>
      <tbody><tr>{probabilities.map(probability =>
        <td key={probability} className="border-b border-settings-divider py-1">{probability}</td>
      )}</tr></tbody>
    </table>
  </div>;
}

export function SuperMemoPriorityPage({ boundaries, paired, busy, onChange }: {
  boundaries: readonly number[]; paired: boolean; busy: boolean; onChange(value: readonly number[]): void;
}) {
  const t = useTranslation();
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
          <p>{t('desktop.superMemoDrafts.priorityTargetOrder')}</p>
          <p id="supermemo-priority-probabilities">{t('desktop.superMemoDrafts.priorityProbabilityIntro')}</p>
          <PriorityProbabilities />
          <p>{t('desktop.superMemoDrafts.priorityEmptyQueues')}</p>
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
