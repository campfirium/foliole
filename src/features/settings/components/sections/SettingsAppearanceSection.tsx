import {
  setActionHelpCardsEnabled,
  useActionHelpCardsEnabled
} from '../../../../shared/platform/actionHelpCards';
import {
  SettingsControlSlot,
  SettingsSection,
  SettingsRow,
  SettingsSegmentedRow,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
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
  AppearanceDarkModeContentSection,
  AppearanceReadingColorSection
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

function InterfaceBehaviorSection() {
  const actionHelpEnabled = useActionHelpCardsEnabled();
  return (
    <SettingsSection ariaLabel="Interface behavior settings section" title="Interface">
      <SettingsRow
        description="Pause on an action to see what it does, when context is available."
        title="Action help on hover"
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button
            aria-checked={actionHelpEnabled}
            aria-label="Action help on hover"
            className={settingsSwitchClassName(actionHelpEnabled)}
            onClick={() => setActionHelpCardsEnabled(!actionHelpEnabled)}
            role="switch"
            type="button"
          >
            <span
              aria-hidden="true"
              className={settingsSwitchKnobClassName(actionHelpEnabled)}
            />
          </button>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

function AppearanceReadingTypographySection(props: ReturnType<typeof useAppearanceSectionState>) {
  const { appearance, fontOptions } = props;

  return (
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
      onReadingContentWidthChange={appearance.setReadingContentWidth}
      onReadingLineHeightChange={appearance.setReadingLineHeight}
      onReadingParagraphSpacingChange={appearance.setReadingParagraphSpacing}
      readingContentWidth={appearance.readingContentWidth}
      readingLineHeight={appearance.readingLineHeight}
      readingParagraphSpacing={appearance.readingParagraphSpacing}
    />
  );
}

export function SettingsAppearanceSection(props: { onEnterPreview: () => void }) {
  const state = useAppearanceSectionState();
  return (
    <>
      <AppearanceColorModeSection {...state} />
      <WorkspaceSurfaceColorSection onEnterPreview={props.onEnterPreview} />
      <WorkspaceDividerSettingsSection />
      <AppearanceReadingTypographySection {...state} />
      <AppearanceReadingColorSection
        appearance={state.appearance}
        safeAccentColor={state.safeAccentColor}
        safeClozeColor={state.safeClozeColor}
        safeFontColor={state.safeFontColor}
        safeHighlightColor={state.safeHighlightColor}
        safeSelectionColor={state.safeSelectionColor}
      />
      <NodeIconSettingsSection />
      <NodeListRowSpacingSection />
      <AppearanceDarkModeContentSection appearance={state.appearance} />
      <InterfaceBehaviorSection />
    </>
  );
}
