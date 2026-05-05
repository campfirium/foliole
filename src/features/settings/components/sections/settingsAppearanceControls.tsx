import type { RefObject } from 'react';

import { SettingsControlSlot, SettingsRow } from '../../../../shared/ui';
import {
  DEFAULT_ACCENT_COLOR_PRESET,
  DEFAULT_CLOZE_COLOR_PRESET,
  DEFAULT_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_SELECTION_COLOR_PRESET,
  INTERFACE_FONT_SIZE_MAX,
  INTERFACE_FONT_SIZE_MIN
} from '../../model/appearanceSettings';

function settingsFieldClassName() {
  return 'w-full min-w-0 rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm text-foreground';
}

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
      <SettingsControlSlot>
        <select aria-label={props.ariaLabel ?? props.label} className={settingsFieldClassName()} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value)} value={props.value}>
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
  colorInputRef: RefObject<HTMLInputElement>;
  onOpenColorPicker: () => void;
  onReset: () => void;
  pickerButtonAriaLabel: string;
  resetButtonAriaLabel: string;
  title: string;
  description: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
}) {
  return (
    <SettingsRow description={props.description} title={props.title}>
      <SettingsControlSlot>
        <button aria-label={props.resetButtonAriaLabel} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:cursor-default disabled:opacity-55" disabled={props.value === props.defaultValue} onClick={props.onReset} type="button">↺</button>
        <button aria-label={props.pickerButtonAriaLabel} className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full" onClick={props.onOpenColorPicker} type="button">
          <span aria-hidden="true" className="inline-flex h-[30px] w-[30px] rounded-full border border-foreground/20" style={{ backgroundColor: props.value }} />
        </button>
        <input aria-label={props.colorInputAriaLabel} className="pointer-events-none absolute h-0 w-0 opacity-0" onChange={(event) => props.onChange(event.target.value)} ref={props.colorInputRef} type="color" value={props.value} />
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function AccentColorRow(props: {
  accentColorInputRef: RefObject<HTMLInputElement>;
  onAccentColorPresetReset: () => void;
  onOpenAccentColorPicker: () => void;
  safeAccentColor: string;
  setAccentColorPreset: (value: string) => void;
}) {
  return (
    <ColorSettingRow
      colorInputAriaLabel="Accent color picker"
      colorInputRef={props.accentColorInputRef}
      defaultValue={DEFAULT_ACCENT_COLOR_PRESET}
      description="Choose accent color for selected states, links, and quote rendering."
      onChange={props.setAccentColorPreset}
      onOpenColorPicker={props.onOpenAccentColorPicker}
      onReset={props.onAccentColorPresetReset}
      pickerButtonAriaLabel="Pick accent color"
      resetButtonAriaLabel="Reset accent color"
      title="Accent color"
      value={props.safeAccentColor}
    />
  );
}

export function HighlightColorRow(props: {
  highlightColorInputRef: RefObject<HTMLInputElement>;
  onHighlightColorPresetReset: () => void;
  onOpenHighlightColorPicker: () => void;
  safeHighlightColor: string;
  setHighlightColorPreset: (value: string) => void;
}) {
  return (
    <ColorSettingRow
      colorInputAriaLabel="Highlight color picker"
      colorInputRef={props.highlightColorInputRef}
      defaultValue={DEFAULT_HIGHLIGHT_COLOR_PRESET}
      description="Choose the color used for highlight marks in both the editor and PDF."
      onChange={props.setHighlightColorPreset}
      onOpenColorPicker={props.onOpenHighlightColorPicker}
      onReset={props.onHighlightColorPresetReset}
      pickerButtonAriaLabel="Pick highlight color"
      resetButtonAriaLabel="Reset highlight color"
      title="Highlight color"
      value={props.safeHighlightColor}
    />
  );
}

export function SelectionColorRow(props: {
  selectionColorInputRef: RefObject<HTMLInputElement>;
  onSelectionColorPresetReset: () => void;
  onOpenSelectionColorPicker: () => void;
  safeSelectionColor: string;
  setSelectionColorPreset: (value: string) => void;
}) {
  return (
    <ColorSettingRow
      colorInputAriaLabel="Selection color picker"
      colorInputRef={props.selectionColorInputRef}
      defaultValue={DEFAULT_SELECTION_COLOR_PRESET}
      description="Choose the color used for text selection in both the editor and PDF."
      onChange={props.setSelectionColorPreset}
      onOpenColorPicker={props.onOpenSelectionColorPicker}
      onReset={props.onSelectionColorPresetReset}
      pickerButtonAriaLabel="Pick selection color"
      resetButtonAriaLabel="Reset selection color"
      title="Selection color"
      value={props.safeSelectionColor}
    />
  );
}

export function ClozeColorRow(props: {
  clozeColorInputRef: RefObject<HTMLInputElement>;
  onClozeColorPresetReset: () => void;
  onOpenClozeColorPicker: () => void;
  safeClozeColor: string;
  setClozeColorPreset: (value: string) => void;
}) {
  return (
    <ColorSettingRow
      colorInputAriaLabel="Cloze color picker"
      colorInputRef={props.clozeColorInputRef}
      defaultValue={DEFAULT_CLOZE_COLOR_PRESET}
      description="Choose the color used for cloze marks in the editor."
      onChange={props.setClozeColorPreset}
      onOpenColorPicker={props.onOpenClozeColorPicker}
      onReset={props.onClozeColorPresetReset}
      pickerButtonAriaLabel="Pick cloze color"
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
      <SettingsControlSlot className="justify-end">
        <button aria-label="Reset font size" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-foreground/[0.06] hover:text-foreground" onClick={props.onInterfaceFontSizeReset} type="button">↺</button>
        <input aria-label="Interface font size" className="w-[136px]" max={INTERFACE_FONT_SIZE_MAX} min={INTERFACE_FONT_SIZE_MIN} onChange={(event) => props.onInterfaceFontSizeChange(Number(event.target.value))} step={1} type="range" value={props.interfaceFontSize} />
        <span className="min-w-[38px] text-right text-[0.86rem] text-foreground/65">{props.interfaceFontSize}px</span>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
