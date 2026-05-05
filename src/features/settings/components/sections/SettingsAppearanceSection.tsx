import { useRef } from 'react';

import { SettingsSection } from '../../../../shared/ui';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import {
  DEFAULT_ACCENT_COLOR_PRESET,
  DEFAULT_CLOZE_COLOR_PRESET,
  DEFAULT_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_SELECTION_COLOR_PRESET
} from '../../model/appearanceSettings';
import { useSettingsFontOptions } from '../useSettingsFontOptions';

import { NodeIconSettingsSection } from './NodeIconSettingsSection';
import { NodeListRowSpacingSection } from './NodeListRowSpacingSection';
import {
  AccentColorRow,
  ClozeColorRow,
  HighlightColorRow,
  SelectionColorRow,
  SettingsSelectRow
} from './settingsAppearanceControls';
import { SettingsAppearanceFontSection } from './SettingsAppearanceFontSection';
import { WorkspaceSurfaceColorSection } from './WorkspaceSurfaceColorSection';

function ensureAccentHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_ACCENT_COLOR_PRESET;
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
  const accentColorInputRef = useRef<HTMLInputElement>(null);
  const selectionColorInputRef = useRef<HTMLInputElement>(null);
  const highlightColorInputRef = useRef<HTMLInputElement>(null);
  const clozeColorInputRef = useRef<HTMLInputElement>(null);
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
    accentColorInputRef,
    selectionColorInputRef,
    highlightColorInputRef,
    clozeColorInputRef,
    appearance,
    baseColorOptions: [{ label: 'Light', value: 'light' }],
    fontOptions,
    safeAccentColor: ensureAccentHex(appearance.accentColorPreset),
    safeSelectionColor: ensureSelectionHex(appearance.selectionColorPreset),
    safeHighlightColor: ensureHighlightHex(appearance.highlightColorPreset),
    safeClozeColor: ensureClozeHex(appearance.clozeColorPreset)
  };
}

function AppearanceColorSection(props: ReturnType<typeof useAppearanceSectionState>) {
  const {
    accentColorInputRef,
    appearance,
    baseColorOptions,
    clozeColorInputRef,
    highlightColorInputRef,
    safeAccentColor,
    safeClozeColor,
    safeHighlightColor,
    safeSelectionColor,
    selectionColorInputRef
  } = props;

  return (
    <SettingsSection ariaLabel="Appearance color section" title="Color">
      <SettingsSelectRow
        description="Choose the foundation color mode for the interface."
        label="Base color"
        onChange={(value) => appearance.setBaseColorMode(value as typeof appearance.baseColorMode)}
        options={baseColorOptions}
        value={appearance.baseColorMode}
      />
      <AccentColorRow
        accentColorInputRef={accentColorInputRef}
        onAccentColorPresetReset={appearance.resetAccentColorPreset}
        onOpenAccentColorPicker={() => accentColorInputRef.current?.click()}
        safeAccentColor={safeAccentColor}
        setAccentColorPreset={(value) => appearance.setAccentColorPreset(value as typeof appearance.accentColorPreset)}
      />
      <SelectionColorRow
        onOpenSelectionColorPicker={() => selectionColorInputRef.current?.click()}
        onSelectionColorPresetReset={appearance.resetSelectionColorPreset}
        safeSelectionColor={safeSelectionColor}
        selectionColorInputRef={selectionColorInputRef}
        setSelectionColorPreset={(value) => appearance.setSelectionColorPreset(value as typeof appearance.selectionColorPreset)}
      />
      <HighlightColorRow
        highlightColorInputRef={highlightColorInputRef}
        onHighlightColorPresetReset={appearance.resetHighlightColorPreset}
        onOpenHighlightColorPicker={() => highlightColorInputRef.current?.click()}
        safeHighlightColor={safeHighlightColor}
        setHighlightColorPreset={(value) => appearance.setHighlightColorPreset(value as typeof appearance.highlightColorPreset)}
      />
      <ClozeColorRow
        clozeColorInputRef={clozeColorInputRef}
        onClozeColorPresetReset={appearance.resetClozeColorPreset}
        onOpenClozeColorPicker={() => clozeColorInputRef.current?.click()}
        safeClozeColor={safeClozeColor}
        setClozeColorPreset={(value) => appearance.setClozeColorPreset(value as typeof appearance.clozeColorPreset)}
      />
    </SettingsSection>
  );
}

function AppearanceSupportingSections(props: ReturnType<typeof useAppearanceSectionState>) {
  const { appearance, fontOptions } = props;

  return (
    <>
      <WorkspaceSurfaceColorSection />
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

export function SettingsAppearanceSection() {
  const state = useAppearanceSectionState();
  return (
    <>
      <AppearanceColorSection {...state} />
      <AppearanceSupportingSections {...state} />
    </>
  );
}
