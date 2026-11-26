import {
  getPriorityWeight,
  REGULAR_PUSH_QUEUE_PRIORITIES
} from '../../../lib/core/review/unifiedPushQueueRules';
import { ReviewNumberInput } from '../../../src/features/settings/components/sections/reviewSettingsControls';
import { useReviewSchedulerSettings } from '../../../src/features/settings/context/ReviewSchedulerSettingsProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  settingsFieldClassName,
  SettingsRow,
  SettingsSection
} from '../../../src/shared/ui';

const formatPercent = new Intl.NumberFormat('zh-Hans', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

function PriorityProbabilities({ ratio }: { ratio: number }) {
  const weights = REGULAR_PUSH_QUEUE_PRIORITIES.map((priority) => getPriorityWeight(priority, ratio));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const p1 = weights[0]!;
  const p9 = weights[weights.length - 1]!;
  const p1WithP9 = p1 / (p1 + p9);

  return (
    <>
      <p>按当前权重 {ratio}，假设 P0 已取完且 P1–P9 都有到期内容，下一次抽中各队列的概率如下。</p>
      <div className="overflow-x-auto">
        <table aria-label="P1 至 P9 下一次被抽中的概率" className="w-full min-w-[290px] table-fixed text-center text-xs tabular-nums">
          <thead><tr>{REGULAR_PUSH_QUEUE_PRIORITIES.map((priority) => (
            <th key={priority} scope="col" className="border-b border-settings-divider py-1 font-semibold text-foreground">P{priority}</th>
          ))}</tr></thead>
          <tbody><tr>{REGULAR_PUSH_QUEUE_PRIORITIES.map((priority, index) => (
            <td key={priority} className="border-b border-settings-divider py-1">{formatPercent.format(weights[index]! / total)}</td>
          ))}</tr></tbody>
        </table>
      </div>
      <p>如果只有 P1 和 P9 有到期内容，两者的概率会变为 {formatPercent.format(p1WithP9)} 和 {formatPercent.format(1 - p1WithP9)}。</p>
    </>
  );
}

function PriorityOrderRules({ ratio }: { ratio: number }) {
  return (
    <div className="px-settings-panel-x pb-settings-panel-y">
      <h4 className="text-ui-lg font-normal text-foreground">学习顺序</h4>
      <dl className="mt-2 grid gap-3 text-ui-md leading-6 text-foreground/64">
        <div>
          <dt className="font-semibold text-foreground">分别排队</dt>
          <dd>阅读主题和复习检测项各自按 P0–P9 分成十个队列。混合学习时，再按「阅读与复习比例」从两类队列取用。</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">P0 · 绝对优先</dt>
          <dd>在同一类队列里，先取完 P0 的到期内容，再从 P1–P9 取用。</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">P1–P9 · 按权重抽取</dt>
          <dd className="grid gap-2">
            <p>每次只从有到期内容的队列里抽取。权重大于 1 时，P1 最容易被抽中，P2 到 P9 依次降低。某队列取空后，按剩余队列重新计算概率。</p>
            <PriorityProbabilities ratio={ratio} />
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">同级顺序</dt>
          <dd>抽中常规队列后取队首。同级检测项参考遗忘程度，同级阅读主题参考相对逾期程度，并分散来自同一层级分支的内容。</dd>
        </div>
      </dl>
    </div>
  );
}

export function ReviewOrderPreview() {
  const { reviewSchedulerSettings, onDefaultPriorityChange, onPriorityRatioChange } = useReviewSchedulerSettings();
  const { defaultPriority, priorityRatio } = reviewSchedulerSettings.pushQueue;

  return (
    <SettingsSection ariaLabel="优先级" title="优先级">
      <SettingsRow title="默认优先级"
        description="主题或检测项没有自己的优先级时，沿用最近一级已设置的上级。没有可继承的值时，使用这里的默认值。文件夹开启强制优先级时，以最近的强制设置为准。">
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <select aria-label="默认优先级" className={settingsFieldClassName(SETTINGS_SELECT_WIDTH_CLASS_NAME)}
            value={defaultPriority} onChange={(event) => onDefaultPriorityChange(Number(event.target.value))}>
            {REGULAR_PUSH_QUEUE_PRIORITIES.map((priority) => <option key={priority} value={priority}>P{priority}</option>)}
          </select>
        </SettingsControlSlot>
      </SettingsRow>
      <SettingsRow title="优先级权重"
        description="P1 和 P9 都有到期内容时，这个数值就是 P1 被抽中的概率相对 P9 的倍数。设为 1 时，所有非空常规队列等概率。">
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <ReviewNumberInput ariaLabel="优先级权重" min={1} step={0.1} value={priorityRatio} onChange={onPriorityRatioChange} />
        </SettingsControlSlot>
      </SettingsRow>
      <PriorityOrderRules ratio={priorityRatio} />
    </SettingsSection>
  );
}
