import type { RefObject } from 'react';

import { SettingsControlSlot, SettingsRow } from '../../../../shared/ui';
import {
  DEFAULT_ACCENT_COLOR_PRESET,
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

export function AccentColorRow(props: {
  accentColorInputRef: RefObject<HTMLInputElement>;
  onAccentColorPresetReset: () => void;
  onOpenAccentColorPicker: () => void;
  safeAccentColor: string;
  setAccentColorPreset: (value: string) => void;
}) {
  return (
    <SettingsRow description="Choose accent color for selected states, links, and quote rendering." title="Accent color">
      <SettingsControlSlot>
        <button aria-label="Reset accent color" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:cursor-default disabled:opacity-55" disabled={props.safeAccentColor === DEFAULT_ACCENT_COLOR_PRESET} onClick={props.onAccentColorPresetReset} type="button">↺</button>
        <button aria-label="Pick accent color" className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full" onClick={props.onOpenAccentColorPicker} type="button">
          <span aria-hidden="true" className="inline-flex h-[30px] w-[30px] rounded-full border border-foreground/20" style={{ backgroundColor: props.safeAccentColor }} />
        </button>
        <input aria-label="Accent color picker" className="pointer-events-none absolute h-0 w-0 opacity-0" onChange={(event) => props.setAccentColorPreset(event.target.value)} ref={props.accentColorInputRef} type="color" value={props.safeAccentColor} />
      </SettingsControlSlot>
    </SettingsRow>
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
