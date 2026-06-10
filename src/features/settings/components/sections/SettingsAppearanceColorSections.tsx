import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  SettingsSegmentedRow,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import type { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import {
  DEFAULT_ACCENT_COLOR_PRESET,
  DEFAULT_CLOZE_COLOR_PRESET,
  DEFAULT_DARK_ACCENT_COLOR_PRESET,
  DEFAULT_DARK_CLOZE_COLOR_PRESET,
  DEFAULT_DARK_FONT_COLOR_PRESET,
  DEFAULT_DARK_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_DARK_SELECTION_COLOR_PRESET,
  DEFAULT_FONT_COLOR_PRESET,
  DEFAULT_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_SELECTION_COLOR_PRESET
} from '../../model/appearanceSettings';

import {
  AccentColorRow,
  ClozeColorRow,
  FontColorRow,
  HighlightColorRow,
  SelectionColorRow
} from './appearanceColorRows';

type AppearanceSettings = ReturnType<typeof useAppearanceSettings>;

function defaultModeColor(light: string, dark: string, appearance: AppearanceSettings) {
  return appearance.resolvedBaseColorMode === 'dark' ? dark : light;
}

function AppearancePdfReadingModeRow(props: { appearance: AppearanceSettings }) {
  const t = useTranslation();

  return (
    <SettingsSegmentedRow
      description={t('settings.appearance.pdfDarkMode.description')}
      label={t('settings.appearance.pdfDarkMode.title')}
      onChange={(value) => props.appearance.setPdfReadingMode(value as typeof props.appearance.pdfReadingMode)}
      options={[
        { label: t('settings.appearance.pdfDarkMode.original'), value: 'original' },
        { label: t('settings.appearance.pdfDarkMode.inverted'), value: 'inverted' },
        { label: t('settings.appearance.pdfDarkMode.warm'), value: 'warm' }
      ]}
      value={props.appearance.pdfReadingMode}
    />
  );
}

function DimImagesInDarkModeRow(props: { appearance: AppearanceSettings }) {
  const t = useTranslation();
  const { appearance } = props;

  return (
    <SettingsRow
      description={t('settings.appearance.dimImages.description')}
      title={t('settings.appearance.dimImages.title')}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-checked={appearance.dimImagesInDarkMode}
          aria-label={t('settings.appearance.dimImages.title')}
          className={settingsSwitchClassName(appearance.dimImagesInDarkMode)}
          onClick={() => appearance.setDimImagesInDarkMode(!appearance.dimImagesInDarkMode)}
          role="switch"
          type="button"
        >
          <span
            aria-hidden="true"
            className={settingsSwitchKnobClassName(appearance.dimImagesInDarkMode)}
          />
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function AppearanceReadingColorSection(props: {
  appearance: AppearanceSettings;
  safeAccentColor: string;
  safeClozeColor: string;
  safeFontColor: string;
  safeHighlightColor: string;
  safeSelectionColor: string;
}) {
  const t = useTranslation();

  return (
    <SettingsSection ariaLabel={t('settings.appearance.colors.sectionAria')} title={t('settings.appearance.colors.section')}>
      <AccentColorRow
        defaultAccentColor={defaultModeColor(DEFAULT_ACCENT_COLOR_PRESET, DEFAULT_DARK_ACCENT_COLOR_PRESET, props.appearance)}
        onAccentColorPresetReset={props.appearance.resetAccentColorPreset}
        safeAccentColor={props.safeAccentColor}
        setAccentColorPreset={(value) => props.appearance.setAccentColorPreset(value as typeof props.appearance.accentColorPreset)}
      />
      <FontColorRow
        defaultFontColor={defaultModeColor(DEFAULT_FONT_COLOR_PRESET, DEFAULT_DARK_FONT_COLOR_PRESET, props.appearance)}
        onFontColorPresetReset={props.appearance.resetFontColorPreset}
        safeFontColor={props.safeFontColor}
        setFontColorPreset={(value) => props.appearance.setFontColorPreset(value as typeof props.appearance.fontColorPreset)}
      />
      <SelectionColorRow
        defaultSelectionColor={defaultModeColor(DEFAULT_SELECTION_COLOR_PRESET, DEFAULT_DARK_SELECTION_COLOR_PRESET, props.appearance)}
        onSelectionColorPresetReset={props.appearance.resetSelectionColorPreset}
        safeSelectionColor={props.safeSelectionColor}
        setSelectionColorPreset={(value) => props.appearance.setSelectionColorPreset(value as typeof props.appearance.selectionColorPreset)}
      />
      <HighlightColorRow
        defaultHighlightColor={defaultModeColor(DEFAULT_HIGHLIGHT_COLOR_PRESET, DEFAULT_DARK_HIGHLIGHT_COLOR_PRESET, props.appearance)}
        onHighlightColorPresetReset={props.appearance.resetHighlightColorPreset}
        safeHighlightColor={props.safeHighlightColor}
        setHighlightColorPreset={(value) => props.appearance.setHighlightColorPreset(value as typeof props.appearance.highlightColorPreset)}
      />
      <ClozeColorRow
        defaultClozeColor={defaultModeColor(DEFAULT_CLOZE_COLOR_PRESET, DEFAULT_DARK_CLOZE_COLOR_PRESET, props.appearance)}
        onClozeColorPresetReset={props.appearance.resetClozeColorPreset}
        safeClozeColor={props.safeClozeColor}
        setClozeColorPreset={(value) => props.appearance.setClozeColorPreset(value as typeof props.appearance.clozeColorPreset)}
      />
    </SettingsSection>
  );
}

export function AppearanceDarkModeContentSection(props: { appearance: AppearanceSettings }) {
  const t = useTranslation();

  return (
    <SettingsSection ariaLabel={t('settings.appearance.darkMode.sectionAria')} title={t('settings.appearance.darkMode.section')}>
      <AppearancePdfReadingModeRow appearance={props.appearance} />
      <DimImagesInDarkModeRow appearance={props.appearance} />
    </SettingsSection>
  );
}
