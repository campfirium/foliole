import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  SettingsSegmentedRow,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import {
  DEFAULT_ACCENT_COLOR_PRESET,
  DEFAULT_CLOZE_COLOR_PRESET,
  DEFAULT_DARK_FONT_COLOR_PRESET,
  DEFAULT_FONT_COLOR_PRESET,
  DEFAULT_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_SELECTION_COLOR_PRESET
} from '../../model/appearanceSettings';
import { useSettingsFontOptions } from '../useSettingsFontOptions';

import { NodeListRowSpacingSection } from './NodeListRowSpacingSection';
import {
  AccentColorRow,
  ClozeColorRow,
  FontColorRow,
  HighlightColorRow,
  SelectionColorRow
} from './settingsAppearanceControls';
import { SettingsAppearanceFontSection } from './SettingsAppearanceFontSection';
import { WorkspaceSurfaceColorSection } from './WorkspaceSurfaceColorSection';

function ensureAccentHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_ACCENT_COLOR_PRESET;
}

function ensureFontHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_FONT_COLOR_PRESET;
}

function ensureHighlightHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_HIGHLIGHT_COLOR_PRESET;
}

function ensureSelectionHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_SELECTION_COLOR_PRESET;
}

function ensureClozeHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_CLOZE_COLOR_PRESET;
}

function useAppearanceSectionState() {
  const appearance = useAppearanceSettings();
  const fontOptions = useSettingsFontOptions({
    customInterfaceFont: appearance.customInterfaceFont,
    customMonospaceFont: appearance.customMonospaceFont,
    customUiFont: appearance.customUiFont,
    interfaceFontPreset: appearance.interfaceFontPreset,
    monospaceFontPreset: appearance.monospaceFontPreset,
    uiFontPreset: appearance.uiFontPreset
  });
  return {
    appearance,
    fontOptions,
    safeAccentColor: ensureAccentHex(appearance.accentColorPreset),
    safeFontColor: ensureFontHex(appearance.fontColorPreset),
    safeSelectionColor: ensureSelectionHex(appearance.selectionColorPreset),
    safeHighlightColor: ensureHighlightHex(appearance.highlightColorPreset),
    safeClozeColor: ensureClozeHex(appearance.clozeColorPreset)
  };
}

function AppearanceColorModeSection(props: ReturnType<typeof useAppearanceSectionState>) {
  const { appearance } = props;

  return (
    <SettingsSection ariaLabel="Appearance color mode section" title="Color mode">
      <SettingsSegmentedRow
        ariaLabel="Mode"
        description="Choose whether Foliole stays light, stays dark, or follows the system appearance."
        label="Base color mode"
        onChange={(value) => appearance.setBaseColorMode(value as typeof appearance.baseColorMode)}
        options={[
          { label: 'Light', value: 'light' },
          { label: 'Dark', value: 'dark' },
          { label: 'System', value: 'system' }
        ]}
        value={appearance.baseColorMode}
      />
    </SettingsSection>
  );
}

function AppearancePdfReadingModeRow(props: ReturnType<typeof useAppearanceSectionState>) {
  const { appearance } = props;

  return (
    <SettingsSegmentedRow
      description="Choose how PDF pages render in the reader. Original keeps the source page, inverted uses a softer dark reading preset, and warm keeps a paper-like tone."
      label="PDF reading mode"
      onChange={(value) => appearance.setPdfReadingMode(value as typeof appearance.pdfReadingMode)}
      options={[
        { label: 'Original', value: 'original' },
        { label: 'Inverted', value: 'inverted' },
        { label: 'Warm', value: 'warm' }
      ]}
      value={appearance.pdfReadingMode}
    />
  );
}

function DimImagesInDarkModeRow(props: ReturnType<typeof useAppearanceSectionState>) {
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

function AppearanceColorSection(props: ReturnType<typeof useAppearanceSectionState>) {
  const {
    appearance,
    safeAccentColor,
    safeClozeColor,
    safeFontColor,
    safeHighlightColor,
    safeSelectionColor
  } = props;
  const defaultFontColor = appearance.resolvedBaseColorMode === 'dark'
    ? DEFAULT_DARK_FONT_COLOR_PRESET
    : DEFAULT_FONT_COLOR_PRESET;

  return (
    <SettingsSection ariaLabel="Appearance color section" title="Color">
      <FontColorRow
        defaultFontColor={defaultFontColor}
        onFontColorPresetReset={appearance.resetFontColorPreset}
        safeFontColor={safeFontColor}
        setFontColorPreset={(value) => appearance.setFontColorPreset(value as typeof appearance.fontColorPreset)}
      />
      <AccentColorRow
        onAccentColorPresetReset={appearance.resetAccentColorPreset}
        safeAccentColor={safeAccentColor}
        setAccentColorPreset={(value) => appearance.setAccentColorPreset(value as typeof appearance.accentColorPreset)}
      />
      <SelectionColorRow
        onSelectionColorPresetReset={appearance.resetSelectionColorPreset}
        safeSelectionColor={safeSelectionColor}
        setSelectionColorPreset={(value) => appearance.setSelectionColorPreset(value as typeof appearance.selectionColorPreset)}
      />
      <HighlightColorRow
        onHighlightColorPresetReset={appearance.resetHighlightColorPreset}
        safeHighlightColor={safeHighlightColor}
        setHighlightColorPreset={(value) => appearance.setHighlightColorPreset(value as typeof appearance.highlightColorPreset)}
      />
      <ClozeColorRow
        onClozeColorPresetReset={appearance.resetClozeColorPreset}
        safeClozeColor={safeClozeColor}
        setClozeColorPreset={(value) => appearance.setClozeColorPreset(value as typeof appearance.clozeColorPreset)}
      />
      <AppearancePdfReadingModeRow {...props} />
      <DimImagesInDarkModeRow {...props} />
    </SettingsSection>
  );
}

function AppearanceSupportingSections(props: ReturnType<typeof useAppearanceSectionState>) {
  const { appearance, fontOptions } = props;

  return (
    <>
      <NodeListRowSpacingSection />
      <SettingsAppearanceFontSection
        {...fontOptions}
        interfaceFontSize={appearance.interfaceFontSize}
        onInterfaceFontSelectionChange={(value) =>
          value.startsWith('preset:')
            ? appearance.setInterfaceFontPreset(value.slice('preset:'.length) as typeof appearance.interfaceFontPreset)
            : value.startsWith('font:') &&
              (appearance.setCustomInterfaceFont(value.slice('font:'.length)), appearance.setInterfaceFontPreset('custom'))
        }
        onInterfaceFontSizeChange={appearance.setInterfaceFontSize}
        onInterfaceFontSizeReset={appearance.resetInterfaceFontSize}
        onMonospaceFontSelectionChange={(value) =>
          value.startsWith('mono-preset:')
            ? appearance.setMonospaceFontPreset(value.slice('mono-preset:'.length) as typeof appearance.monospaceFontPreset)
            : value.startsWith('mono-font:') &&
              (appearance.setCustomMonospaceFont(value.slice('mono-font:'.length)), appearance.setMonospaceFontPreset('custom'))
        }
        onUiFontSelectionChange={(value) =>
          value.startsWith('ui-preset:')
            ? appearance.setUiFontPreset(value.slice('ui-preset:'.length) as typeof appearance.uiFontPreset)
            : value.startsWith('ui-font:') &&
              (appearance.setCustomUiFont(value.slice('ui-font:'.length)), appearance.setUiFontPreset('custom'))
        }
      />
    </>
  );
}

export function SettingsAppearanceSection(props: { onEnterPreview: () => void }) {
  const state = useAppearanceSectionState();
  return (
    <>
      <AppearanceColorModeSection {...state} />
      <WorkspaceSurfaceColorSection onEnterPreview={props.onEnterPreview} />
      <AppearanceColorSection {...state} />
      <AppearanceSupportingSections {...state} />
    </>
  );
}
