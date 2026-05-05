import type { ReactNode } from 'react';

import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_RANGE_WIDTH_CLASS_NAME,
  SETTINGS_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsControlValueClassName,
  settingsRangeClassName
} from '../../../../shared/ui';
import { useReviewSchedulerSettings } from '../../context/ReviewSchedulerSettingsProvider';

import {
  DefaultPriorityControl,
  QueueMixRatioControl,
  ReadingGrowthFactorRangeControl,
  ReviewNumberInput,
  ReviewToggleControl
} from './reviewSettingsControls';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

interface SettingsReviewSectionProps {
  desiredRetention: number;
  maximumIntervalDays: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  defaultPriority: number;
  priorityRatio: number;
  queueMixRatioReading: number;
  queueMixRatioFsrs: number;
  readingInitialIntervalMs: number;
  readingIntervalGrowthFactorMin: number;
  readingIntervalGrowthFactorMax: number;
  onDesiredRetentionChange: (value: number) => void;
  onMaximumIntervalDaysChange: (value: number) => void;
  onEnableFuzzChange: (value: boolean) => void;
  onEnableShortTermChange: (value: boolean) => void;
  onDefaultPriorityChange: (value: number) => void;
  onPriorityRatioChange: (value: number) => void;
  onQueueMixRatioReadingChange: (value: number) => void;
  onQueueMixRatioFsrsChange: (value: number) => void;
  onReadingInitialIntervalDaysChange: (value: number) => void;
  onReadingIntervalGrowthFactorMinChange: (value: number) => void;
  onReadingIntervalGrowthFactorMaxChange: (value: number) => void;
}

interface ReviewSettingRowProps {
  control: ReactNode;
  description: string;
  title: string;
}

function ReviewSettingRow({ title, description, control }: ReviewSettingRowProps) {
  return <SettingsRow description={description} title={title}>{control}</SettingsRow>;
}

function SchedulerCoreRows(props: Pick<
  SettingsReviewSectionProps,
  | 'desiredRetention'
  | 'maximumIntervalDays'
  | 'enableFuzz'
  | 'enableShortTerm'
  | 'onDesiredRetentionChange'
  | 'onMaximumIntervalDaysChange'
  | 'onEnableFuzzChange'
  | 'onEnableShortTermChange'
>) {
  return (
    <>
      <ReviewSettingRow
        title="Desired retention"
        description="Lower values shorten intervals. Recommended around 0.80-0.95. Review previews update after each change."
        control={
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <input
              aria-label="Desired retention"
              className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)}
              max={0.99}
              min={0.01}
              onChange={(event) => props.onDesiredRetentionChange(Number(event.target.value))}
              step={0.01}
              type="range"
              value={props.desiredRetention}
            />
            <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME)}>{props.desiredRetention.toFixed(2)}</span>
          </SettingsControlSlot>
        }
      />
      <ReviewSettingRow
        title="Maximum interval"
        description="Cap long-term intervals in days. Lower values make future review previews shorten sooner."
        control={
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            <span className="sr-only">Maximum interval days</span>
            <ReviewNumberInput ariaLabel="Maximum interval days" min={1} onChange={props.onMaximumIntervalDaysChange} step={1} value={props.maximumIntervalDays} />
          </SettingsControlSlot>
        }
      />
      <ReviewSettingRow
        title="Spread same-day cards"
        description="Slightly randomize intervals so cards due on the same day get spread out."
        control={<ReviewToggleControl ariaLabel="Interval fuzz" onChange={props.onEnableFuzzChange} value={props.enableFuzz} />}
      />
      <ReviewSettingRow
        title="Short-term scheduling"
        description="Enable extra short-term learning steps for new or forgotten cards."
        control={<ReviewToggleControl ariaLabel="Short-term scheduling" onChange={props.onEnableShortTermChange} value={props.enableShortTerm} />}
      />
    </>
  );
}

function PushQueueRows(props: Pick<
  SettingsReviewSectionProps,
  | 'defaultPriority'
  | 'priorityRatio'
  | 'queueMixRatioReading'
  | 'queueMixRatioFsrs'
  | 'readingInitialIntervalMs'
  | 'readingIntervalGrowthFactorMin'
  | 'readingIntervalGrowthFactorMax'
  | 'onDefaultPriorityChange'
  | 'onPriorityRatioChange'
  | 'onQueueMixRatioReadingChange'
  | 'onQueueMixRatioFsrsChange'
  | 'onReadingInitialIntervalDaysChange'
  | 'onReadingIntervalGrowthFactorMinChange'
  | 'onReadingIntervalGrowthFactorMaxChange'
>) {
  const readingInitialIntervalDays = Number((props.readingInitialIntervalMs / DAY_IN_MS).toFixed(2));

  return (
    <>
      <ReviewSettingRow
        title="Default topic priority"
        description="Fallback priority for new topics when neither the topic nor its ancestors set one."
        control={<DefaultPriorityControl onChange={props.onDefaultPriorityChange} value={props.defaultPriority} />}
      />
      <ReviewSettingRow
        title="Reading vs review mix"
        description="How often a reading card is drawn against a review card. The default 1:5 means one reading draw after every five review draws."
        control={<QueueMixRatioControl fsrs={props.queueMixRatioFsrs} onFsrsChange={props.onQueueMixRatioFsrsChange} onReadingChange={props.onQueueMixRatioReadingChange} reading={props.queueMixRatioReading} />}
      />
      <ReviewSettingRow
        title="Priority weight"
        description="How strongly higher-priority topics are favored. The default 5 means a P1 topic is drawn five times as often as a P9 topic."
        control={<SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}><ReviewNumberInput ariaLabel="Priority weight" min={1} onChange={props.onPriorityRatioChange} step={0.1} value={props.priorityRatio} /></SettingsControlSlot>}
      />
      <ReviewSettingRow
        title="Reading initial interval"
        description="Wait time after a reading card is handled before it can return to the reading queue (in days)."
        control={<SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}><ReviewNumberInput ariaLabel="Reading initial interval days" min={0.01} onChange={props.onReadingInitialIntervalDaysChange} step={0.25} value={readingInitialIntervalDays} /></SettingsControlSlot>}
      />
      <ReviewSettingRow
        title="Reading interval growth"
        description="How quickly the reading interval grows after each pass. The minimum applies to P1 topics, the maximum to P9, and intermediate priorities interpolate."
        control={<ReadingGrowthFactorRangeControl maxValue={props.readingIntervalGrowthFactorMax} minValue={props.readingIntervalGrowthFactorMin} onMaxChange={props.onReadingIntervalGrowthFactorMaxChange} onMinChange={props.onReadingIntervalGrowthFactorMinChange} />}
      />
    </>
  );
}

export function SettingsReviewSection() {
  const reviewSettings = useReviewSchedulerSettings();
  const { reviewSchedulerSettings } = reviewSettings;

  return (
    <SettingsSection ariaLabel="Review settings section" title="Scheduler">
      <SchedulerCoreRows
        desiredRetention={reviewSchedulerSettings.desiredRetention}
        enableFuzz={reviewSchedulerSettings.enableFuzz}
        enableShortTerm={reviewSchedulerSettings.enableShortTerm}
        maximumIntervalDays={reviewSchedulerSettings.maximumIntervalDays}
        onDesiredRetentionChange={reviewSettings.onDesiredRetentionChange}
        onEnableFuzzChange={reviewSettings.onEnableFuzzChange}
        onEnableShortTermChange={reviewSettings.onEnableShortTermChange}
        onMaximumIntervalDaysChange={reviewSettings.onMaximumIntervalDaysChange}
      />
      <PushQueueRows
        defaultPriority={reviewSchedulerSettings.pushQueue.defaultPriority}
        onDefaultPriorityChange={reviewSettings.onDefaultPriorityChange}
        onPriorityRatioChange={reviewSettings.onPriorityRatioChange}
        onQueueMixRatioFsrsChange={reviewSettings.onQueueMixRatioFsrsChange}
        onQueueMixRatioReadingChange={reviewSettings.onQueueMixRatioReadingChange}
        onReadingInitialIntervalDaysChange={reviewSettings.onReadingInitialIntervalDaysChange}
        onReadingIntervalGrowthFactorMaxChange={reviewSettings.onReadingIntervalGrowthFactorMaxChange}
        onReadingIntervalGrowthFactorMinChange={reviewSettings.onReadingIntervalGrowthFactorMinChange}
        priorityRatio={reviewSchedulerSettings.pushQueue.priorityRatio}
        queueMixRatioFsrs={reviewSchedulerSettings.pushQueue.queueMixRatio.fsrs}
        queueMixRatioReading={reviewSchedulerSettings.pushQueue.queueMixRatio.reading}
        readingInitialIntervalMs={reviewSchedulerSettings.pushQueue.readingInitialIntervalMs}
        readingIntervalGrowthFactorMax={reviewSchedulerSettings.pushQueue.readingIntervalGrowthFactorRange.max}
        readingIntervalGrowthFactorMin={reviewSchedulerSettings.pushQueue.readingIntervalGrowthFactorRange.min}
      />
    </SettingsSection>
  );
}
