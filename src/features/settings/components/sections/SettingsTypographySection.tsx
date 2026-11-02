import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import { useSettingsFontOptions } from '../useSettingsFontOptions';

import { NodeListRowSpacingSection } from './NodeListRowSpacingSection';
import { SettingsAppearanceFontSection } from './SettingsAppearanceFontSection';

export function SettingsTypographySection(props: { onEnterPreview: () => void }) {
  const appearance = useAppearanceSettings();
  const fontOptions = useSettingsFontOptions({
    customInterfaceFont: appearance.customInterfaceFont,
    customMonospaceFont: appearance.customMonospaceFont,
    interfaceFontPreset: appearance.interfaceFontPreset,
    monospaceFontPreset: appearance.monospaceFontPreset
  });
  const selectTextFont = (value: string) => {
    if (value === fontOptions.selectedInterfaceFontValue) return;
    void appearance.readingFontWeightSettings.update(400);
    if (value.startsWith('preset:')) appearance.setInterfaceFontPreset(value.slice(7) as typeof appearance.interfaceFontPreset);
    else if (value.startsWith('font:')) {
      appearance.setCustomInterfaceFont(value.slice(5));
      appearance.setInterfaceFontPreset('custom');
    }
  };
  return (
    <>
      <SettingsAppearanceFontSection
        {...fontOptions}
        onEnterPreview={props.onEnterPreview}
        interfaceFontSize={appearance.interfaceFontSize}
        onInterfaceFontSelectionChange={selectTextFont}
        onInterfaceFontSizeChange={appearance.setInterfaceFontSize}
        onInterfaceFontSizeReset={appearance.resetInterfaceFontSize}
        onMonospaceFontSelectionChange={(value) => value.startsWith('mono-preset:')
          ? appearance.setMonospaceFontPreset(value.slice(12) as typeof appearance.monospaceFontPreset)
          : value.startsWith('mono-font:') && (appearance.setCustomMonospaceFont(value.slice(10)), appearance.setMonospaceFontPreset('custom'))}
        onReadingContentWidthChange={appearance.setReadingContentWidth}
        onReadingLineHeightChange={appearance.setReadingLineHeight}
        onReadingParagraphSpacingChange={appearance.setReadingParagraphSpacing}
        readingContentWidth={appearance.readingContentWidth}
        readingLineHeight={appearance.readingLineHeight}
        readingParagraphSpacing={appearance.readingParagraphSpacing}
      />
      <NodeListRowSpacingSection />
    </>
  );
}
