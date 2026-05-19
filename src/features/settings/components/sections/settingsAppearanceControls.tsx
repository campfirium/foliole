import { RotateCcw } from 'lucide-react';

import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME,
  SETTINGS_RANGE_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SETTINGS_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  settingsColorSwatchClassName,
  settingsControlValueClassName,
  settingsFieldClassName,
  settingsRangeClassName,
  settingsResetButtonClassName
} from '../../../../shared/ui';
import {
  DEFAULT_ACCENT_COLOR_PRESET,
  DEFAULT_CLOZE_COLOR_PRESET,
  DEFAULT_FONT_COLOR_PRESET,
  DEFAULT_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_SELECTION_COLOR_PRESET,
  INTERFACE_FONT_SIZE_MAX,
  INTERFACE_FONT_SIZE_MIN
} from '../../model/appearanceSettings';

export function SettingsSelectRow(props: {
  ariaLabel?: string;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <SettingsRow description={props.description} title={props.label}>
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <select aria-label={props.ariaLabel ?? props.label} className={settingsFieldClassName(SETTINGS_SELECT_WIDTH_CLASS_NAME)} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value)} value={props.value}>
          {props.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function ColorSettingRow(props: {
  colorInputAriaLabel: string;
  onReset: () => void;
  resetButtonAriaLabel: string;
  title: string;
  description: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
}) {
  return (
    <SettingsRow description={props.description} title={props.title}>
      <SettingsControlSlot className={SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME}>
        <button aria-label={props.resetButtonAriaLabel} className={settingsResetButtonClassName('disabled:cursor-default disabled:opacity-45')} disabled={props.value === props.defaultValue} onClick={props.onReset} type="button">
          <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
        </button>
        <div className="inline-flex min-h-9 items-center gap-2.5">
          <label className="relative h-9 w-9 shrink-0">
            <span
              aria-hidden="true"
              className={settingsColorSwatchClassName('pointer-events-none absolute inset-0')}
              style={{ backgroundColor: props.value }}
            />
            <input
              aria-label={props.colorInputAriaLabel}
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(event) => props.onChange(event.target.value)}
              type="color"
              value={props.value}
            />
          </label>
          <label className="shrink-0 text-sm text-foreground/72">
            <input
              aria-label={`${props.title} hex value`}
              className={settingsFieldClassName(`${SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME} tabular-nums`)}
              onChange={(event) => props.onChange(event.target.value)}
              spellCheck={false}
              value={props.value.toUpperCase()}
            />
          </label>
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function AccentColorRow(props: {
  defaultAccentColor: string;
  onAccentColorPresetReset: () => void;
  safeAccentColor: string;
  setAccentColorPreset: (value: string) => void;
}) {
  return (
    <ColorSettingRow
      colorInputAriaLabel="Accent color picker"
      defaultValue={props.defaultAccentColor || DEFAULT_ACCENT_COLOR_PRESET}
      description="Choose accent color for selected states, links, and quote rendering."
      onChange={props.setAccentColorPreset}
      onReset={props.onAccentColorPresetReset}
      resetButtonAriaLabel="Reset accent color"
      title="Accent color"
      value={props.safeAccentColor}
    />
  );
}

export function FontColorRow(props: {
  defaultFontColor: string;
  onFontColorPresetReset: () => void;
  safeFontColor: string;
  setFontColorPreset: (value: string) => void;
}) {
  return (
    <ColorSettingRow
      colorInputAriaLabel="Font color picker"
      defaultValue={props.defaultFontColor || DEFAULT_FONT_COLOR_PRESET}
      description="Choose the unified foreground color used by workspace text and icons."
      onChange={props.setFontColorPreset}
      onReset={props.onFontColorPresetReset}
      resetButtonAriaLabel="Reset font color"
      title="Font color"
      value={props.safeFontColor}
    />
  );
}

export function HighlightColorRow(props: {
  defaultHighlightColor: string;
  onHighlightColorPresetReset: () => void;
  safeHighlightColor: string;
  setHighlightColorPreset: (value: string) => void;
}) {
  return (
    <ColorSettingRow
      colorInputAriaLabel="Highlight color picker"
      defaultValue={props.defaultHighlightColor || DEFAULT_HIGHLIGHT_COLOR_PRESET}
      description="Choose the color used for highlight marks in both the editor and PDF."
      onChange={props.setHighlightColorPreset}
      onReset={props.onHighlightColorPresetReset}
      resetButtonAriaLabel="Reset highlight color"
      title="Highlight color"
      value={props.safeHighlightColor}
    />
  );
}

export function SelectionColorRow(props: {
  defaultSelectionColor: string;
  onSelectionColorPresetReset: () => void;
  safeSelectionColor: string;
  setSelectionColorPreset: (value: string) => void;
}) {
  return (
    <ColorSettingRow
      colorInputAriaLabel="Selection color picker"
      defaultValue={props.defaultSelectionColor || DEFAULT_SELECTION_COLOR_PRESET}
      description="Choose the color used for text selection in both the editor and PDF."
      onChange={props.setSelectionColorPreset}
      onReset={props.onSelectionColorPresetReset}
      resetButtonAriaLabel="Reset selection color"
      title="Selection color"
      value={props.safeSelectionColor}
    />
  );
}

export function ClozeColorRow(props: {
  defaultClozeColor: string;
  onClozeColorPresetReset: () => void;
  safeClozeColor: string;
  setClozeColorPreset: (value: string) => void;
}) {
  return (
    <ColorSettingRow
      colorInputAriaLabel="Cloze color picker"
      defaultValue={props.defaultClozeColor || DEFAULT_CLOZE_COLOR_PRESET}
      description="Choose the color used for cloze marks in the editor."
      onChange={props.setClozeColorPreset}
      onReset={props.onClozeColorPresetReset}
      resetButtonAriaLabel="Reset cloze color"
      title="Cloze color"
      value={props.safeClozeColor}
    />
  );
}

export function FontSizeRow(props: {
  interfaceFontSize: number;
  onInterfaceFontSizeChange: (value: number) => void;
  onInterfaceFontSizeReset: () => void;
}) {
  return (
    <SettingsRow description="Adjust main content panel font size in pixels." title="Font size">
      <SettingsControlSlot className={SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME}>
        <button aria-label="Reset font size" className={settingsResetButtonClassName()} onClick={props.onInterfaceFontSizeReset} type="button">
          <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
        </button>
        <input aria-label="Interface font size" className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)} max={INTERFACE_FONT_SIZE_MAX} min={INTERFACE_FONT_SIZE_MIN} onChange={(event) => props.onInterfaceFontSizeChange(Number(event.target.value))} step={1} type="range" value={props.interfaceFontSize} />
        <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME)}>{props.interfaceFontSize}px</span>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
