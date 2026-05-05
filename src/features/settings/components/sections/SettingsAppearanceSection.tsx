import { SettingsSection } from '../../../../shared/ui';
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
  SelectionColorRow,
  SettingsSelectRow
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
      <SettingsSelectRow
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
      <label className="flex min-h-[78px] items-start justify-between gap-5 py-5 max-[1080px]:flex-col max-[1080px]:items-start" data-settings-row>
        <span className="min-w-0 flex-1">
          <span className="text-[0.95rem] font-semibold text-foreground">Dim images in dark mode</span>
          <span className="mt-0.5 block text-sm text-foreground/65">Apply a gentle dimming filter to regular document images when the app is in dark mode.</span>
        </span>
        <span className="inline-flex max-w-full flex-[0_0_360px] items-center justify-end gap-3 max-[1080px]:w-full max-[1080px]:flex-auto">
          <button
            aria-checked={appearance.dimImagesInDarkMode}
            aria-label="Dim images in dark mode"
            className={`relative inline-flex h-10 w-[72px] shrink-0 items-center rounded-full border transition-colors ${
              appearance.dimImagesInDarkMode
                ? 'border-border-strong bg-foreground/[0.12]'
                : 'border-border bg-bg-elevated'
            }`}
            onClick={() => appearance.setDimImagesInDarkMode(!appearance.dimImagesInDarkMode)}
            role="switch"
            type="button"
          >
            <span
              aria-hidden="true"
              className={`absolute h-8 w-8 rounded-full transition-transform ${
                appearance.dimImagesInDarkMode
                  ? 'translate-x-[34px] bg-foreground'
                  : 'translate-x-[4px] bg-bg-panel'
              }`}
            />
          </button>
        </span>
      </label>
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
      <WorkspaceSurfaceColorSection onEnterPreview={props.onEnterPreview} />
      <AppearanceColorSection {...state} />
      <AppearanceSupportingSections {...state} />
    </>
  );
}
