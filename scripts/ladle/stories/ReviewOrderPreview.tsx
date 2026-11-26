import { useState } from 'react';

import {
  DEFAULT_UNIFIED_PUSH_QUEUE_RULES,
  getPriorityWeight,
  REGULAR_PUSH_QUEUE_PRIORITIES
} from '../../../lib/core/review/unifiedPushQueueRules';
import { ReviewNumberInput } from '../../../src/features/settings/components/sections/reviewSettingsControls';
import { useTranslation } from '../../../src/shared/localization/LocalizationProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  settingsFieldClassName,
  SettingsRow,
  SettingsSection
} from '../../../src/shared/ui';

export interface ReviewOrderPreviewProps {
  title: string;
  explanation: string;
}

const formatPercent = new Intl.NumberFormat('zh-Hans', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

function getExampleProbabilities(scenario: string, ratio: number) {
  if (scenario === 'p0') {
    return [0, ...REGULAR_PUSH_QUEUE_PRIORITIES].map((priority) => ({
      priority,
      chance: priority === 0 ? 1 : 0
    }));
  }

  const weights = REGULAR_PUSH_QUEUE_PRIORITIES.map((priority) => {
    if (scenario === 'endpoints' && priority !== 1 && priority !== 9) return 0;
    return getPriorityWeight(priority, ratio);
  });
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  return REGULAR_PUSH_QUEUE_PRIORITIES.map((priority, index) => ({
    priority,
    chance: weights[index]! / totalWeight
  }));
}

export function ReviewOrderPreview({ title, explanation }: ReviewOrderPreviewProps) {
  const t = useTranslation();
  const [ratio, setRatio] = useState(DEFAULT_UNIFIED_PUSH_QUEUE_RULES.priorityRatio);
  const [scenario, setScenario] = useState('all');
  const probabilities = getExampleProbabilities(scenario, ratio);
  const weightLabel = t('settings.search.reviewPriorityWeight.title');

  return (
    <SettingsSection title={t('settings.review.section')}>
      <SettingsRow title={weightLabel}
        description={t('settings.search.reviewPriorityWeight.description')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <ReviewNumberInput ariaLabel={weightLabel} min={1} step={0.1} value={ratio}
            onChange={(value) => { if (Number.isFinite(value) && value >= 1) setRatio(value); }} />
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow title={title} description={explanation}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <select aria-label="到期队列示例" className={settingsFieldClassName(SETTINGS_SELECT_WIDTH_CLASS_NAME)}
            value={scenario} onChange={(event) => setScenario(event.target.value)}>
            <option value="all">P1–P9 均有到期项</option>
            <option value="endpoints">仅 P1 和 P9 有到期项</option>
            <option value="p0">P0 也有到期项</option>
          </select>
        </SettingsControlSlot>
      </SettingsRow>
      <div className="px-settings-panel-x pb-settings-panel-y text-ui-md text-foreground/64">
        <div className="overflow-x-auto">
          <table aria-label="各队列下一次被选中的概率" className="w-full min-w-[290px] table-fixed text-center text-xs tabular-nums">
            <thead><tr>{probabilities.map(({ priority }) => (
              <th key={priority} scope="col" className="border-b border-settings-divider py-1 font-semibold text-foreground">P{priority}</th>
            ))}</tr></thead>
            <tbody><tr>{probabilities.map(({ priority, chance }) => (
              <td key={priority} className="border-b border-settings-divider py-1">{formatPercent.format(chance)}</td>
            ))}</tr></tbody>
          </table>
        </div>
        {scenario !== 'p0' ? <p className="mt-3 leading-6">P1 和 P9 都有到期检测项时，P1 被选中的概率是 P9 的 {ratio} 倍。</p> : null}
      </div>
    </SettingsSection>
  );
}
