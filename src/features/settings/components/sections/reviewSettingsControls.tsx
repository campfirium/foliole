import { SettingsControlSlot, settingsFieldClassName } from '../../../../shared/ui';

export function ReviewToggleControl(props: {
  ariaLabel: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <SettingsControlSlot>
      <span className="sr-only">{props.ariaLabel}</span>
      <select
        aria-label={props.ariaLabel}
        className={settingsFieldClassName()}
        onChange={(event) => props.onChange(event.target.value === 'on')}
        value={props.value ? 'on' : 'off'}
      >
        <option value="off">Off</option>
        <option value="on">On</option>
      </select>
    </SettingsControlSlot>
  );
}

export function ReviewNumberInput(props: {
  ariaLabel: string;
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      aria-label={props.ariaLabel}
      className={settingsFieldClassName()}
      max={props.max}
      min={props.min}
      onChange={(event) => props.onChange(Number(event.target.value))}
      step={props.step}
      type="number"
      value={props.value}
    />
  );
}

export function DefaultPriorityControl(props: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <SettingsControlSlot>
      <span className="sr-only">Default node priority</span>
      <select
        aria-label="Default node priority"
        className={settingsFieldClassName()}
        onChange={(event) => props.onChange(Number(event.target.value))}
        value={String(props.value)}
      >
        {Array.from({ length: 10 }, (_, index) => (
          <option key={index} value={index}>
            {index === 0 ? 'P0 · Absolute privilege' : `P${index}`}
          </option>
        ))}
      </select>
    </SettingsControlSlot>
  );
}

export function QueueMixRatioControl(props: {
  reading: number;
  fsrs: number;
  onReadingChange: (value: number) => void;
  onFsrsChange: (value: number) => void;
}) {
  return (
    <SettingsControlSlot className="justify-end">
      <ReviewNumberInput ariaLabel="Reading queue mix ratio" min={1} onChange={props.onReadingChange} step={1} value={props.reading} />
      <span className="text-[0.86rem] text-foreground/65">:</span>
      <ReviewNumberInput ariaLabel="FSRS queue mix ratio" min={1} onChange={props.onFsrsChange} step={1} value={props.fsrs} />
      <span className="min-w-[38px] text-right text-[0.86rem] text-foreground/65">{`${props.reading}:${props.fsrs}`}</span>
    </SettingsControlSlot>
  );
}

export function ReadingGrowthFactorRangeControl(props: {
  minValue: number;
  maxValue: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
}) {
  return (
    <SettingsControlSlot className="justify-end">
      <ReviewNumberInput ariaLabel="Reading growth factor min" min={1} onChange={props.onMinChange} step={0.01} value={props.minValue} />
      <span className="text-[0.86rem] text-foreground/65">to</span>
      <ReviewNumberInput ariaLabel="Reading growth factor max" min={1} onChange={props.onMaxChange} step={0.01} value={props.maxValue} />
    </SettingsControlSlot>
  );
}
