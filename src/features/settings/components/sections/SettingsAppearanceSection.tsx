import { useRef } from 'react';

import { SettingsRow, SettingsSection } from '../../../../shared/ui';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import { DEFAULT_ACCENT_COLOR_PRESET } from '../../model/appearanceSettings';
import { useSettingsFontOptions } from '../useSettingsFontOptions';

import { NodeIconSettingsSection } from './NodeIconSettingsSection';
import { NodeListRowSpacingSection } from './NodeListRowSpacingSection';
import { AccentColorRow, SettingsSelectRow } from './settingsAppearanceControls';
import { SettingsAppearanceFontSection } from './SettingsAppearanceFontSection';

function ensureAccentHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_ACCENT_COLOR_PRESET;
}

function useAppearanceSectionState() {
  const accentColorInputRef = useRef<HTMLInputElement>(null);
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
    appearance,
    baseColorOptions: [{ label: 'Light', value: 'light' }],
    fontOptions,
    safeAccentColor: ensureAccentHex(appearance.accentColorPreset)
  };
}

export function SettingsAppearanceSection() {
  const { accentColorInputRef, appearance, baseColorOptions, fontOptions, safeAccentColor } =
    useAppearanceSectionState();

  return (
    <>
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
        <SettingsRow description="Theme package management will be added in a follow-up task." readonly title="Theme">
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.82rem] text-foreground/70">Planned</span>
        </SettingsRow>
      </SettingsSection>
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
