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
import { FontSizeRow } from './settingsAppearanceControls';
import { SettingsFontComboboxRow } from './SettingsFontComboboxRow';

function buildFontOptions<T extends string>(prefix: string, values: T[], labelForValue: (value: T) => string) {
  return values.map((value) => ({ label: labelForValue(value), value: `${prefix}:${value}` }));
}

export function SettingsAppearanceFontSection(props: {
  selectedInterfaceFontValue: string;
  selectedMonospaceFontValue: string;
  interfaceFontOptions: string[];
  monospaceFontOptions: string[];
  isLoadingFontOptions: boolean;
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
  requestFontOptions: () => void;
}) {
  const t = useTranslation();
  const textOptions = [...buildFontOptions('preset', INTERFACE_PRESET_OPTION_VALUES, (value) => presetLabel(value, t)), ...buildFontOptions('font', props.interfaceFontOptions, (font) => font)];
  const monospaceOptions = [...buildFontOptions('mono-preset', MONOSPACE_PRESET_OPTION_VALUES, (value) => monospacePresetLabel(value, t)), ...buildFontOptions('mono-font', props.monospaceFontOptions, (font) => font)];

  return (
    <SettingsSection ariaLabel={t('settings.appearance.section.readingTypography')} title={t('settings.appearance.section.readingTypography')}>
      <div data-settings-search-row-id="typography-text-font"><SettingsFontComboboxRow ariaLabel={t('settings.appearance.textFont.title')} description={t('settings.appearance.textFont.description')} label={t('settings.appearance.textFont.title')} loading={props.isLoadingFontOptions} onChange={props.onInterfaceFontSelectionChange} onOpen={props.requestFontOptions} options={textOptions} value={props.selectedInterfaceFontValue} /></div>
      <div data-settings-search-row-id="typography-monospace-font"><SettingsFontComboboxRow ariaLabel={t('settings.appearance.monospaceFont.aria')} description={t('settings.appearance.monospaceFont.description')} label={t('settings.appearance.monospaceFont.title')} loading={props.isLoadingFontOptions} onChange={props.onMonospaceFontSelectionChange} onOpen={props.requestFontOptions} options={monospaceOptions} value={props.selectedMonospaceFontValue} /></div>
      <div data-settings-search-row-id="typography-reading-font-size"><FontSizeRow interfaceFontSize={props.interfaceFontSize} onInterfaceFontSizeChange={props.onInterfaceFontSizeChange} onInterfaceFontSizeReset={props.onInterfaceFontSizeReset} /></div>
      <div data-settings-search-row-id="typography-reading-line-height"><ReadingLineHeightRow
        onReadingLineHeightChange={props.onReadingLineHeightChange}
        readingLineHeight={props.readingLineHeight}
      /></div>
      <div data-settings-search-row-id="typography-paragraph-spacing"><ReadingParagraphSpacingRow
        onReadingParagraphSpacingChange={props.onReadingParagraphSpacingChange}
        readingParagraphSpacing={props.readingParagraphSpacing}
      /></div>
      <div data-settings-search-row-id="typography-reading-width"><ReadingContentWidthRow
        onReadingContentWidthChange={props.onReadingContentWidthChange}
        readingContentWidth={props.readingContentWidth}
      /></div>
    </SettingsSection>
  );
}
