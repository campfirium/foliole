import { SettingsSection } from '../../../../shared/ui';
import {
  INTERFACE_PRESET_OPTION_VALUES,
  MONOSPACE_PRESET_OPTION_VALUES,
  monospacePresetLabel,
  presetLabel
} from '../../model/settingsPanelOptions';

import { SettingsSelectRow } from './settingsAppearanceControls';
import { FontSizeRow } from './settingsAppearanceControls';

function buildFontOptions<T extends string>(prefix: string, values: T[], labelForValue: (value: T) => string) {
  return values.map((value) => ({ label: labelForValue(value), value: `${prefix}:${value}` }));
}

export function SettingsAppearanceFontSection(props: {
  selectedInterfaceFontValue: string;
  selectedMonospaceFontValue: string;
  interfaceFontOptions: string[];
  monospaceFontOptions: string[];
  areFontOptionsReady: boolean;
  interfaceFontSize: number;
  onInterfaceFontSelectionChange: (value: string) => void;
  onMonospaceFontSelectionChange: (value: string) => void;
  onInterfaceFontSizeChange: (value: number) => void;
  onInterfaceFontSizeReset: () => void;
}) {
  const textOptions = [...buildFontOptions('preset', INTERFACE_PRESET_OPTION_VALUES, presetLabel), ...buildFontOptions('font', props.interfaceFontOptions, (font) => font)];
  const monospaceOptions = [...buildFontOptions('mono-preset', MONOSPACE_PRESET_OPTION_VALUES, monospacePresetLabel), ...buildFontOptions('mono-font', props.monospaceFontOptions, (font) => font)];

  return (
    <SettingsSection ariaLabel="Appearance fonts section" title="Fonts">
      <SettingsSelectRow ariaLabel="Text font" description="Font used in main content text." disabled={!props.areFontOptionsReady} label="Text font" onChange={props.onInterfaceFontSelectionChange} options={textOptions} value={props.selectedInterfaceFontValue} />
      <SettingsSelectRow ariaLabel="Monospace font preset" description="Code font in fenced blocks and inline code. Monospaced fonts are listed first." disabled={!props.areFontOptionsReady} label="Monospace font" onChange={props.onMonospaceFontSelectionChange} options={monospaceOptions} value={props.selectedMonospaceFontValue} />
      <FontSizeRow interfaceFontSize={props.interfaceFontSize} onInterfaceFontSizeChange={props.onInterfaceFontSizeChange} onInterfaceFontSizeReset={props.onInterfaceFontSizeReset} />
    </SettingsSection>
  );
}
