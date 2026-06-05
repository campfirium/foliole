import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SettingsSection } from '../../../../shared/ui';
import {
  INTERFACE_PRESET_OPTION_VALUES,
  MONOSPACE_PRESET_OPTION_VALUES,
  monospacePresetLabel,
  presetLabel
} from '../../model/settingsPanelOptions';

import { ReadingContentWidthRow } from './ReadingContentWidthRow';
import { ReadingLineHeightRow } from './ReadingLineHeightRow';
import { ReadingParagraphSpacingRow } from './ReadingParagraphSpacingRow';
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
  readingContentWidth: number;
  readingLineHeight: number;
  readingParagraphSpacing: number;
  onInterfaceFontSelectionChange: (value: string) => void;
  onMonospaceFontSelectionChange: (value: string) => void;
  onInterfaceFontSizeChange: (value: number) => void;
  onInterfaceFontSizeReset: () => void;
  onReadingContentWidthChange: (value: number) => void;
  onReadingLineHeightChange: (value: number) => void;
  onReadingParagraphSpacingChange: (value: number) => void;
}) {
  const t = useTranslation();
  const textOptions = [...buildFontOptions('preset', INTERFACE_PRESET_OPTION_VALUES, (value) => presetLabel(value, t)), ...buildFontOptions('font', props.interfaceFontOptions, (font) => font)];
  const monospaceOptions = [...buildFontOptions('mono-preset', MONOSPACE_PRESET_OPTION_VALUES, (value) => monospacePresetLabel(value, t)), ...buildFontOptions('mono-font', props.monospaceFontOptions, (font) => font)];

  return (
    <SettingsSection ariaLabel={t('settings.appearance.section.readingTypography')} title={t('settings.appearance.section.readingTypography')}>
      <SettingsSelectRow ariaLabel={t('settings.appearance.textFont.title')} description={t('settings.appearance.textFont.description')} disabled={!props.areFontOptionsReady} label={t('settings.appearance.textFont.title')} onChange={props.onInterfaceFontSelectionChange} options={textOptions} value={props.selectedInterfaceFontValue} />
      <SettingsSelectRow ariaLabel={t('settings.appearance.monospaceFont.aria')} description={t('settings.appearance.monospaceFont.description')} disabled={!props.areFontOptionsReady} label={t('settings.appearance.monospaceFont.title')} onChange={props.onMonospaceFontSelectionChange} options={monospaceOptions} value={props.selectedMonospaceFontValue} />
      <FontSizeRow interfaceFontSize={props.interfaceFontSize} onInterfaceFontSizeChange={props.onInterfaceFontSizeChange} onInterfaceFontSizeReset={props.onInterfaceFontSizeReset} />
      <ReadingLineHeightRow
        onReadingLineHeightChange={props.onReadingLineHeightChange}
        readingLineHeight={props.readingLineHeight}
      />
      <ReadingParagraphSpacingRow
        onReadingParagraphSpacingChange={props.onReadingParagraphSpacingChange}
        readingParagraphSpacing={props.readingParagraphSpacing}
      />
      <ReadingContentWidthRow
        onReadingContentWidthChange={props.onReadingContentWidthChange}
        readingContentWidth={props.readingContentWidth}
      />
    </SettingsSection>
  );
}
