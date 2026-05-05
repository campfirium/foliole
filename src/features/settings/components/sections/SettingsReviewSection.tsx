import type { ReactNode } from 'react';

interface SettingsReviewSectionProps {
  desiredRetention: number;
  maximumIntervalDays: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  onDesiredRetentionChange: (value: number) => void;
  onMaximumIntervalDaysChange: (value: number) => void;
  onEnableFuzzChange: (value: boolean) => void;
  onEnableShortTermChange: (value: boolean) => void;
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

export function SettingsReviewSection({
  desiredRetention,
  maximumIntervalDays,
  enableFuzz,
  enableShortTerm,
  onDesiredRetentionChange,
  onMaximumIntervalDaysChange,
  onEnableFuzzChange,
  onEnableShortTermChange
}: SettingsReviewSectionProps) {
  return (
    <section aria-label="Review settings section" className="settings-group">
      <h3 className="settings-group-title">Scheduler</h3>
      <ReviewSettingRow
        title="Desired retention"
        description="Lower values shorten intervals. Recommended around 0.80-0.95. Review previews update after each change."
        control={<div className="settings-slider-wrap"><input aria-label="Desired retention" className="settings-range" max={0.99} min={0.01} onChange={(event) => onDesiredRetentionChange(Number(event.target.value))} step={0.01} type="range" value={desiredRetention} /><span className="settings-range-value">{desiredRetention.toFixed(2)}</span></div>}
      />
      <ReviewSettingRow
        title="Maximum interval"
        description="Cap long-term intervals in days. Lower values make future review previews shorten sooner."
        control={<label className="settings-select-wrap"><span className="sr-only">Maximum interval days</span><input aria-label="Maximum interval days" className="settings-select" min={1} onChange={(event) => onMaximumIntervalDaysChange(Number(event.target.value))} step={1} type="number" value={maximumIntervalDays} /></label>}
      />
      <ReviewSettingRow
        title="Interval fuzz"
        description="Spread same-day due cards by slightly varying intervals."
        control={<ReviewToggleControl ariaLabel="Interval fuzz" onChange={onEnableFuzzChange} value={enableFuzz} />}
      />
      <ReviewSettingRow
        title="Short-term scheduling"
        description="Enable extra short-term learning steps for new or forgotten cards."
        control={<ReviewToggleControl ariaLabel="Short-term scheduling" onChange={onEnableShortTermChange} value={enableShortTerm} />}
      />
    </section>
  );
}
