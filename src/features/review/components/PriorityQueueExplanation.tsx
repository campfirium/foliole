import {
  getPriorityWeight,
  REGULAR_PUSH_QUEUE_PRIORITIES
} from '../../../../lib/core/review/unifiedPushQueueRules';
import { useLocalization } from '../../../shared/localization/LocalizationProvider';

export function PriorityQueueExplanation({ ratio }: { ratio: number }) {
  const { locale, t } = useLocalization();
  const weights = REGULAR_PUSH_QUEUE_PRIORITIES.map((priority) => getPriorityWeight(priority, ratio));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const p1 = weights[0]!;
  const p9 = weights.at(-1)!;
  const twoQueueTotal = p1 + p9;
  const percent = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });

  return <>
    <p>{t('settings.scheduling.priorityOrder')}</p>
    <p>{t('settings.scheduling.priorityRatio')}</p>
    <p>{t('settings.scheduling.priorityExample', { ratio: new Intl.NumberFormat(locale).format(ratio) })}</p>
    <div className="overflow-x-auto">
      <table aria-label={t('settings.scheduling.priorityTable')} className="w-full min-w-[290px] table-fixed text-center text-xs tabular-nums">
        <thead><tr>{REGULAR_PUSH_QUEUE_PRIORITIES.map((priority) => (
          <th key={priority} scope="col" className="border-b border-settings-divider py-1 font-semibold text-foreground">P{priority}</th>
        ))}</tr></thead>
        <tbody><tr>{REGULAR_PUSH_QUEUE_PRIORITIES.map((priority, index) => (
          <td key={priority} className="border-b border-settings-divider py-1">{percent.format(weights[index]! / totalWeight)}</td>
        ))}</tr></tbody>
      </table>
    </div>
    <p>{t('settings.scheduling.priorityEmpty', { p1: percent.format(p1 / twoQueueTotal), p9: percent.format(p9 / twoQueueTotal) })}</p>
  </>;
}
