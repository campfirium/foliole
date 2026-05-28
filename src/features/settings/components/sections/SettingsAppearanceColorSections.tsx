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
} from './settingsAppearanceControls';

type AppearanceSettings = ReturnType<typeof useAppearanceSettings>;

function defaultModeColor(light: string, dark: string, appearance: AppearanceSettings) {
  return appearance.resolvedBaseColorMode === 'dark' ? dark : light;
}

export function AppearancePdfReadingModeRow(props: { appearance: AppearanceSettings }) {
  return (
    <SettingsSegmentedRow
      description="Choose how PDF pages appear when the app uses dark mode. Light mode always shows the original PDF."
      label="PDF in dark mode"
      onChange={(value) => props.appearance.setPdfReadingMode(value as typeof props.appearance.pdfReadingMode)}
      options={[
        { label: 'Original', value: 'original' },
        { label: 'Inverted', value: 'inverted' },
        { label: 'Warm', value: 'warm' }
      ]}
      value={props.appearance.pdfReadingMode}
    />
  );
}

export function DimImagesInDarkModeRow(props: { appearance: AppearanceSettings }) {
  const { appearance } = props;

  return (
    <SettingsRow
      description="Apply a gentle dimming filter to regular document images when the app is in dark mode."
      title="Dim images in dark mode"
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-checked={appearance.dimImagesInDarkMode}
          aria-label="Dim images in dark mode"
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
  return (
    <SettingsSection ariaLabel="Appearance reading colors section" title="Reading colors">
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
  return (
    <SettingsSection ariaLabel="Appearance dark mode content section" title="Dark mode content">
      <AppearancePdfReadingModeRow appearance={props.appearance} />
      <DimImagesInDarkModeRow appearance={props.appearance} />
    </SettingsSection>
  );
}
