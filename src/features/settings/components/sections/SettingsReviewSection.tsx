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
        title="Interval fuzz"
        description="Spread same-day due cards by slightly varying intervals."
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
        description="Set the global `defaultPriority` fallback used when a topic and its ancestors leave `priority` unset."
        control={<DefaultPriorityControl onChange={props.onDefaultPriorityChange} value={props.defaultPriority} />}
      />
      <ReviewSettingRow
        title="Dual queue mix ratio"
        description="Set `queueMixRatio` as the reading:fsrs interleave ratio for the two due queues. The default `1:5` means one reading draw is mixed after five FSRS draws."
        control={<QueueMixRatioControl fsrs={props.queueMixRatioFsrs} onFsrsChange={props.onQueueMixRatioFsrsChange} onReadingChange={props.onQueueMixRatioReadingChange} reading={props.queueMixRatioReading} />}
      />
      <ReviewSettingRow
        title="Priority strength (`priorityRatio`)"
        description="Set `priorityRatio` directly as the roulette weight multiple of P1 relative to P9. This is a weight ratio, not a percentage scale. The default `5` means P1 is weighted 5× P9."
        control={<SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}><ReviewNumberInput ariaLabel="Priority strength (P1 relative to P9)" min={1} onChange={props.onPriorityRatioChange} step={0.1} value={props.priorityRatio} /></SettingsControlSlot>}
      />
      <ReviewSettingRow
        title="Reading initial interval"
        description="Set `readingInitialIntervalMs`, the first delay after a reading card is handled before it can re-enter the reading queue."
        control={<SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}><ReviewNumberInput ariaLabel="Reading initial interval days" min={0.01} onChange={props.onReadingInitialIntervalDaysChange} step={0.25} value={readingInitialIntervalDays} /></SettingsControlSlot>}
      />
      <ReviewSettingRow
        title="Reading growth factor range"
        description="Set `readingIntervalGrowthFactorRange` for reading scheduling. The minimum maps to P1, the maximum maps to P9, and the middle priorities interpolate between them."
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
