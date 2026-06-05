import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  settingsFieldClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';

export function ReviewToggleControl(props: {
  ariaLabel: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
      <button
        aria-checked={props.value}
        aria-label={props.ariaLabel}
        className={settingsSwitchClassName(props.value)}
        onClick={() => props.onChange(!props.value)}
        role="switch"
        type="button"
      >
        <span className={settingsSwitchKnobClassName(props.value)} />
      </button>
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
      className={settingsFieldClassName(SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME)}
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
  ariaLabel: string;
  absoluteLabel: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
      <span className="sr-only">{props.ariaLabel}</span>
      <select
        aria-label={props.ariaLabel}
        className={settingsFieldClassName(SETTINGS_SELECT_WIDTH_CLASS_NAME)}
        onChange={(event) => props.onChange(Number(event.target.value))}
        value={String(props.value)}
      >
        {Array.from({ length: 10 }, (_, index) => (
          <option key={index} value={index}>
            {index === 0 ? props.absoluteLabel : `P${index}`}
          </option>
        ))}
      </select>
    </SettingsControlSlot>
  );
}

export function NewDayStartControl(props: {
  ariaLabel: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
      <select
        aria-label={props.ariaLabel}
        className={settingsFieldClassName(SETTINGS_SELECT_WIDTH_CLASS_NAME)}
        onChange={(event) => props.onChange(Number(event.target.value))}
        value={String(props.value)}
      >
        {Array.from({ length: 24 }, (_, hour) => (
          <option key={hour} value={hour}>
            {`${String(hour).padStart(2, '0')}:00`}
          </option>
        ))}
      </select>
    </SettingsControlSlot>
  );
}

export function QueueMixRatioControl(props: {
  reading: number;
  fsrs: number;
  fsrsAriaLabel: string;
  onReadingChange: (value: number) => void;
  onFsrsChange: (value: number) => void;
  readingAriaLabel: string;
}) {
  return (
    <SettingsControlSlot className={SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME}>
      <ReviewNumberInput ariaLabel={props.readingAriaLabel} min={1} onChange={props.onReadingChange} step={1} value={props.reading} />
      <span className="text-[0.86rem] text-foreground/65">:</span>
      <ReviewNumberInput ariaLabel={props.fsrsAriaLabel} min={1} onChange={props.onFsrsChange} step={1} value={props.fsrs} />
    </SettingsControlSlot>
  );
}

export function ReadingGrowthFactorRangeControl(props: {
  minValue: number;
  maxValue: number;
  maxAriaLabel: string;
  minAriaLabel: string;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
  rangeLabel: string;
}) {
  return (
    <SettingsControlSlot className={SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME}>
      <ReviewNumberInput ariaLabel={props.minAriaLabel} min={1} onChange={props.onMinChange} step={0.01} value={props.minValue} />
      <span className="text-[0.86rem] text-foreground/65">{props.rangeLabel}</span>
      <ReviewNumberInput ariaLabel={props.maxAriaLabel} min={1} onChange={props.onMaxChange} step={0.01} value={props.maxValue} />
    </SettingsControlSlot>
  );
}
