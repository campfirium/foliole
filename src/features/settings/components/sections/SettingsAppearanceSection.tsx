import { SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';
import {
  DEFAULT_ACCENT_COLOR_PRESET,
  INTERFACE_FONT_SIZE_MAX,
  INTERFACE_FONT_SIZE_MIN,
  type AccentColorPreset,
  type BaseColorMode
} from '../../model/appearanceSettings';
import {
  INTERFACE_PRESET_OPTION_VALUES,
  MONOSPACE_PRESET_OPTION_VALUES,
  monospacePresetLabel,
  presetLabel
} from '../../model/settingsPanelOptions';

import { NodeIconSettingsSection } from './NodeIconSettingsSection';
import { NodeListRowSpacingSection } from './NodeListRowSpacingSection';

function settingsFieldClassName() {
  return 'w-full min-w-0 rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm text-foreground';
}

function buildFontOptions<T extends string>(prefix: string, values: T[], labelForValue: (value: T) => string) {
  return values.map((value) => ({ label: labelForValue(value), value: `${prefix}:${value}` }));
}

function SettingsSelectRow(props: {
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
        <select
          aria-label={props.ariaLabel ?? props.label}
          className={settingsFieldClassName()}
          disabled={props.disabled}
          onChange={(event) => props.onChange(event.target.value)}
          value={props.value}
        >
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

function AccentColorRow(props: {
  accentColorInputRef: React.RefObject<HTMLInputElement>;
  onAccentColorPresetChange: (value: AccentColorPreset) => void;
  onAccentColorPresetReset: () => void;
  onOpenAccentColorPicker: () => void;
  safeAccentColor: AccentColorPreset;
}) {
  return (
    <SettingsRow description="Choose accent color for selected states, links, and quote rendering." title="Accent color">
      <SettingsControlSlot>
        <button
          aria-label="Reset accent color"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:cursor-default disabled:opacity-55"
          disabled={props.safeAccentColor === DEFAULT_ACCENT_COLOR_PRESET}
          onClick={props.onAccentColorPresetReset}
          type="button"
        >
          ↺
        </button>
        <button
          aria-label="Pick accent color"
          className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full"
          onClick={props.onOpenAccentColorPicker}
          type="button"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-[30px] w-[30px] rounded-full border border-foreground/20"
            style={{ backgroundColor: props.safeAccentColor }}
          />
        </button>
        <input
          aria-label="Accent color picker"
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          onChange={(event) => props.onAccentColorPresetChange(event.target.value as AccentColorPreset)}
          ref={props.accentColorInputRef}
          type="color"
          value={props.safeAccentColor}
        />
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function FontSizeRow(props: {
  interfaceFontSize: number;
  onInterfaceFontSizeChange: (value: number) => void;
  onInterfaceFontSizeReset: () => void;
}) {
  return (
    <SettingsRow description="Adjust main content panel font size in pixels." title="Font size">
      <SettingsControlSlot className="justify-end">
        <button
          aria-label="Reset font size"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          onClick={props.onInterfaceFontSizeReset}
          type="button"
        >
          ↺
        </button>
        <input
          aria-label="Interface font size"
          className="w-[136px]"
          max={INTERFACE_FONT_SIZE_MAX}
          min={INTERFACE_FONT_SIZE_MIN}
          onChange={(event) => props.onInterfaceFontSizeChange(Number(event.target.value))}
          step={1}
          type="range"
          value={props.interfaceFontSize}
        />
        <span className="min-w-[38px] text-right text-[0.86rem] text-foreground/65">{props.interfaceFontSize}px</span>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function SettingsAppearanceSection(props: {
  baseColorMode: BaseColorMode;
  safeAccentColor: AccentColorPreset;
  selectedUiFontValue: string;
  selectedInterfaceFontValue: string;
  selectedMonospaceFontValue: string;
  uiFontOptions: string[];
  interfaceFontOptions: string[];
  monospaceFontOptions: string[];
  areFontOptionsReady: boolean;
  interfaceFontSize: number;
  onBaseColorModeChange: (value: BaseColorMode) => void;
  onAccentColorPresetChange: (value: AccentColorPreset) => void;
  onAccentColorPresetReset: () => void;
  onOpenAccentColorPicker: () => void;
  onUiFontSelectionChange: (value: string) => void;
  onInterfaceFontSelectionChange: (value: string) => void;
  onMonospaceFontSelectionChange: (value: string) => void;
  onInterfaceFontSizeChange: (value: number) => void;
  onInterfaceFontSizeReset: () => void;
  accentColorInputRef: React.RefObject<HTMLInputElement>;
}) {
  const baseColorOptions = [{ label: 'Light', value: 'light' }];

  return (
    <>
      <SettingsSection ariaLabel="Appearance color section" title="Color">
        <SettingsSelectRow
          description="Choose the foundation color mode for the interface."
          label="Base color"
          onChange={(value) => props.onBaseColorModeChange(value as BaseColorMode)}
          options={baseColorOptions}
          value={props.baseColorMode}
        />
        <AccentColorRow
          accentColorInputRef={props.accentColorInputRef}
          onAccentColorPresetChange={props.onAccentColorPresetChange}
          onAccentColorPresetReset={props.onAccentColorPresetReset}
          onOpenAccentColorPicker={props.onOpenAccentColorPicker}
          safeAccentColor={props.safeAccentColor}
        />
        <SettingsRow description="Theme package management will be added in a follow-up task." readonly title="Theme">
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.82rem] text-foreground/70">Planned</span>
        </SettingsRow>
      </SettingsSection>
      <NodeIconSettingsSection />
      <NodeListRowSpacingSection />
      <FontSection {...props} />
    </>
  );
}

function FontSection(props: {
  selectedUiFontValue: string;
  selectedInterfaceFontValue: string;
  selectedMonospaceFontValue: string;
  uiFontOptions: string[];
  interfaceFontOptions: string[];
  monospaceFontOptions: string[];
  areFontOptionsReady: boolean;
  interfaceFontSize: number;
  onUiFontSelectionChange: (value: string) => void;
  onInterfaceFontSelectionChange: (value: string) => void;
  onMonospaceFontSelectionChange: (value: string) => void;
  onInterfaceFontSizeChange: (value: number) => void;
  onInterfaceFontSizeReset: () => void;
}) {
  const interfaceOptions = [...buildFontOptions('ui-preset', INTERFACE_PRESET_OPTION_VALUES, presetLabel), ...buildFontOptions('ui-font', props.uiFontOptions, (font) => font)];
  const textOptions = [...buildFontOptions('preset', INTERFACE_PRESET_OPTION_VALUES, presetLabel), ...buildFontOptions('font', props.interfaceFontOptions, (font) => font)];
  const monospaceOptions = [...buildFontOptions('mono-preset', MONOSPACE_PRESET_OPTION_VALUES, monospacePresetLabel), ...buildFontOptions('mono-font', props.monospaceFontOptions, (font) => font)];

  return (
    <SettingsSection ariaLabel="Appearance fonts section" title="Fonts">
      <SettingsSelectRow
        ariaLabel="Interface font"
        description="Font used for app chrome and UI controls."
        disabled={!props.areFontOptionsReady}
        label="Interface font"
        onChange={props.onUiFontSelectionChange}
        options={interfaceOptions}
        value={props.selectedUiFontValue}
      />
      <SettingsSelectRow
        ariaLabel="Text font"
        description="Font used in main content text."
        disabled={!props.areFontOptionsReady}
        label="Text font"
        onChange={props.onInterfaceFontSelectionChange}
        options={textOptions}
        value={props.selectedInterfaceFontValue}
      />
      <SettingsSelectRow
        ariaLabel="Monospace font preset"
        description="Code font in fenced blocks and inline code. Monospaced fonts are listed first."
        disabled={!props.areFontOptionsReady}
        label="Monospace font"
        onChange={props.onMonospaceFontSelectionChange}
        options={monospaceOptions}
        value={props.selectedMonospaceFontValue}
      />
      <FontSizeRow
        interfaceFontSize={props.interfaceFontSize}
        onInterfaceFontSizeChange={props.onInterfaceFontSizeChange}
        onInterfaceFontSizeReset={props.onInterfaceFontSizeReset}
      />
    </SettingsSection>
  );
}
