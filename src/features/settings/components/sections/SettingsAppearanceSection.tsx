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

import { NodeIconSettingsSection } from './NodeIconSettingsSection';
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
    baseColorOptions: [
      { label: 'Light', value: 'light' },
      { label: 'Dark', value: 'dark' },
      { label: 'Follow system', value: 'system' }
    ],
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
    </SettingsSection>
  );
}

function BaseColorSection(props: ReturnType<typeof useAppearanceSectionState>) {
  const { appearance, baseColorOptions } = props;
  return (
    <SettingsSection ariaLabel="Base color section" title="Base color">
      <SettingsSelectRow
        description={`Set the foundation color mode. Currently editing ${appearance.resolvedBaseColorMode} settings.`}
        label="Mode"
        onChange={(value) => appearance.setBaseColorMode(value as typeof appearance.baseColorMode)}
        options={baseColorOptions}
        value={appearance.baseColorMode}
      />
    </SettingsSection>
  );
}

function AppearanceSupportingSections(props: ReturnType<typeof useAppearanceSectionState>) {
  const { appearance, fontOptions } = props;

  return (
    <>
      <NodeIconSettingsSection />
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
      <BaseColorSection {...state} />
      <WorkspaceSurfaceColorSection onEnterPreview={props.onEnterPreview} />
      <AppearanceColorSection {...state} />
      <AppearanceSupportingSections {...state} />
    </>
  );
}
