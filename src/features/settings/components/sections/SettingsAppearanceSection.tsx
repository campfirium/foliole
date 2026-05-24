import {
  SettingsSection,
  SettingsSegmentedRow
} from '../../../../shared/ui';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import {
  DEFAULT_ACCENT_COLOR_PRESET,
  DEFAULT_CLOZE_COLOR_PRESET,
  DEFAULT_FONT_COLOR_PRESET,
  DEFAULT_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_SELECTION_COLOR_PRESET
} from '../../model/appearanceSettings';
import { useSettingsFontOptions } from '../useSettingsFontOptions';

import { NodeIconSettingsSection } from './NodeIconSettingsSection';
import { NodeListRowSpacingSection } from './NodeListRowSpacingSection';
import {
  AppearanceLearningColorSection,
  AppearanceReadingSection
} from './SettingsAppearanceColorSections';
import { SettingsAppearanceFontSection } from './SettingsAppearanceFontSection';
import { WorkspaceDividerSettingsSection } from './WorkspaceDividerSettingsSection';
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
      <WorkspaceDividerSettingsSection />
      <AppearanceLearningColorSection
        appearance={state.appearance}
        safeAccentColor={state.safeAccentColor}
        safeClozeColor={state.safeClozeColor}
        safeFontColor={state.safeFontColor}
        safeHighlightColor={state.safeHighlightColor}
        safeSelectionColor={state.safeSelectionColor}
      />
      <AppearanceReadingSection appearance={state.appearance} />
      <AppearanceSupportingSections {...state} />
    </>
  );
}
