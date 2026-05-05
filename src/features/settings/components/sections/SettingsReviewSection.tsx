import type { ReactNode } from 'react';

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
  title: string;
  description: string;
  control: ReactNode;
}

function ReviewSettingRow({ title, description, control }: ReviewSettingRowProps) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      {control}
    </div>
  );
}

function ReviewToggleControl(props: {
  ariaLabel: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="settings-select-wrap">
      <span className="sr-only">{props.ariaLabel}</span>
      <select
        aria-label={props.ariaLabel}
        className="settings-select"
        onChange={(event) => props.onChange(event.target.value === 'on')}
        value={props.value ? 'on' : 'off'}
      >
        <option value="off">Off</option>
        <option value="on">On</option>
      </select>
    </label>
  );
}

function ReviewNumberInputControl(props: {
  ariaLabel: string;
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="settings-select-wrap">
      <span className="sr-only">{props.ariaLabel}</span>
      <input
        aria-label={props.ariaLabel}
        className="settings-select"
        max={props.max}
        min={props.min}
        onChange={(event) => props.onChange(Number(event.target.value))}
        step={props.step}
        type="number"
        value={props.value}
      />
    </label>
  );
}

function DefaultPriorityControl(props: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="settings-select-wrap">
      <span className="sr-only">Default node priority</span>
      <select aria-label="Default node priority" className="settings-select" onChange={(event) => props.onChange(Number(event.target.value))} value={String(props.value)}>
        {Array.from({ length: 10 }, (_, index) => <option key={index} value={index}>{index === 0 ? 'P0 · Absolute privilege' : `P${index}`}</option>)}
      </select>
    </label>
  );
}

function QueueMixRatioControl(props: {
  reading: number;
  fsrs: number;
  onReadingChange: (value: number) => void;
  onFsrsChange: (value: number) => void;
}) {
  return (
    <div className="settings-slider-wrap">
      <ReviewNumberInputControl ariaLabel="Reading queue mix ratio" min={1} onChange={props.onReadingChange} step={1} value={props.reading} />
      <span className="settings-range-value">:</span>
      <ReviewNumberInputControl ariaLabel="FSRS queue mix ratio" min={1} onChange={props.onFsrsChange} step={1} value={props.fsrs} />
      <span className="settings-range-value">{`${props.reading}:${props.fsrs}`}</span>
    </div>
  );
}

function ReadingGrowthFactorRangeControl(props: {
  minValue: number;
  maxValue: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
}) {
  return (
    <div className="settings-slider-wrap">
      <ReviewNumberInputControl ariaLabel="Reading growth factor min" min={1} onChange={props.onMinChange} step={0.01} value={props.minValue} />
      <span className="settings-range-value">to</span>
      <ReviewNumberInputControl ariaLabel="Reading growth factor max" min={1} onChange={props.onMaxChange} step={0.01} value={props.maxValue} />
    </div>
  );
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
        control={<div className="settings-slider-wrap"><input aria-label="Desired retention" className="settings-range" max={0.99} min={0.01} onChange={(event) => props.onDesiredRetentionChange(Number(event.target.value))} step={0.01} type="range" value={props.desiredRetention} /><span className="settings-range-value">{props.desiredRetention.toFixed(2)}</span></div>}
      />
      <ReviewSettingRow
        title="Maximum interval"
        description="Cap long-term intervals in days. Lower values make future review previews shorten sooner."
        control={<label className="settings-select-wrap"><span className="sr-only">Maximum interval days</span><input aria-label="Maximum interval days" className="settings-select" min={1} onChange={(event) => props.onMaximumIntervalDaysChange(Number(event.target.value))} step={1} type="number" value={props.maximumIntervalDays} /></label>}
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
        title="Default node priority"
        description="Set the global `defaultPriority` fallback used when a node and its ancestors leave `priority` unset."
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
        control={<ReviewNumberInputControl ariaLabel="Priority strength (P1 relative to P9)" min={1} onChange={props.onPriorityRatioChange} step={0.1} value={props.priorityRatio} />}
      />
      <ReviewSettingRow
        title="Reading initial interval"
        description="Set `readingInitialIntervalMs`, the first delay after a reading card is handled before it can re-enter the reading queue."
        control={<ReviewNumberInputControl ariaLabel="Reading initial interval days" min={0.01} onChange={props.onReadingInitialIntervalDaysChange} step={0.25} value={readingInitialIntervalDays} />}
      />
      <ReviewSettingRow
        title="Reading growth factor range"
        description="Set `readingIntervalGrowthFactorRange` for reading scheduling. The minimum maps to P1, the maximum maps to P9, and the middle priorities interpolate between them."
        control={<ReadingGrowthFactorRangeControl maxValue={props.readingIntervalGrowthFactorMax} minValue={props.readingIntervalGrowthFactorMin} onMaxChange={props.onReadingIntervalGrowthFactorMaxChange} onMinChange={props.onReadingIntervalGrowthFactorMinChange} />}
      />
    </>
  );
}

export function SettingsReviewSection({
  desiredRetention,
  maximumIntervalDays,
  enableFuzz,
  enableShortTerm,
  defaultPriority,
  priorityRatio,
  queueMixRatioReading,
  queueMixRatioFsrs,
  readingInitialIntervalMs,
  readingIntervalGrowthFactorMin,
  readingIntervalGrowthFactorMax,
  onDesiredRetentionChange,
  onMaximumIntervalDaysChange,
  onEnableFuzzChange,
  onEnableShortTermChange,
  onDefaultPriorityChange,
  onPriorityRatioChange,
  onQueueMixRatioReadingChange,
  onQueueMixRatioFsrsChange,
  onReadingInitialIntervalDaysChange,
  onReadingIntervalGrowthFactorMinChange,
  onReadingIntervalGrowthFactorMaxChange
}: SettingsReviewSectionProps) {
  return (
    <section aria-label="Review settings section" className="settings-group">
      <h3 className="settings-group-title">Scheduler</h3>
      <SchedulerCoreRows desiredRetention={desiredRetention} enableFuzz={enableFuzz} enableShortTerm={enableShortTerm} maximumIntervalDays={maximumIntervalDays} onDesiredRetentionChange={onDesiredRetentionChange} onEnableFuzzChange={onEnableFuzzChange} onEnableShortTermChange={onEnableShortTermChange} onMaximumIntervalDaysChange={onMaximumIntervalDaysChange} />
      <PushQueueRows defaultPriority={defaultPriority} onDefaultPriorityChange={onDefaultPriorityChange} onPriorityRatioChange={onPriorityRatioChange} onQueueMixRatioFsrsChange={onQueueMixRatioFsrsChange} onQueueMixRatioReadingChange={onQueueMixRatioReadingChange} onReadingInitialIntervalDaysChange={onReadingInitialIntervalDaysChange} onReadingIntervalGrowthFactorMaxChange={onReadingIntervalGrowthFactorMaxChange} onReadingIntervalGrowthFactorMinChange={onReadingIntervalGrowthFactorMinChange} priorityRatio={priorityRatio} queueMixRatioFsrs={queueMixRatioFsrs} queueMixRatioReading={queueMixRatioReading} readingInitialIntervalMs={readingInitialIntervalMs} readingIntervalGrowthFactorMax={readingIntervalGrowthFactorMax} readingIntervalGrowthFactorMin={readingIntervalGrowthFactorMin} />
    </section>
  );
}
