import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SettingsSection,
  SettingsSegmentedRow,
} from '../../../../shared/ui';
import { useAppearanceSettings } from '../../context/AppearanceSettingsProvider';
import {
  DEFAULT_ACCENT_COLOR_PRESET,
  DEFAULT_CLOZE_COLOR_PRESET,
  DEFAULT_FONT_COLOR_PRESET,
  DEFAULT_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_SELECTION_COLOR_PRESET
} from '../../model/appearanceSettings';

import { NodeIconSettingsSection } from './NodeIconSettingsSection';
import {
  AppearanceDarkModeContentSection,
  AppearanceReadingColorSection
} from './SettingsAppearanceColorSections';
import { SettingsDisplayScaleSection } from './SettingsDisplayScaleSection';
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
  return {
    appearance,
    safeAccentColor: ensureAccentHex(appearance.accentColorPreset),
    safeFontColor: ensureFontHex(appearance.fontColorPreset),
    safeSelectionColor: ensureSelectionHex(appearance.selectionColorPreset),
    safeHighlightColor: ensureHighlightHex(appearance.highlightColorPreset),
    safeClozeColor: ensureClozeHex(appearance.clozeColorPreset)
  };
}

function AppearanceColorModeSection(props: ReturnType<typeof useAppearanceSectionState>) {
  const { appearance } = props;
  const t = useTranslation();

  return (
    <SettingsSection ariaLabel={t('settings.appearance.colorMode.aria')} title={t('settings.appearance.colorMode.section')}>
      <SettingsSegmentedRow
        ariaLabel={t('settings.appearance.colorMode.modeAria')}
        description={t('settings.appearance.colorMode.description')}
        label={t('settings.appearance.colorMode.row')}
        onChange={(value) => appearance.setBaseColorMode(value as typeof appearance.baseColorMode)}
        options={[
          { label: t('settings.appearance.colorMode.light'), value: 'light' },
          { label: t('settings.appearance.colorMode.dark'), value: 'dark' },
          { label: t('settings.appearance.colorMode.system'), value: 'system' }
        ]}
        value={appearance.baseColorMode}
      />
    </SettingsSection>
  );
}

export function SettingsAppearanceSection(props: {
  onEnterPreview: () => void;
  onSettingsBackdropTransparentChange: (value: boolean) => void;
}) {
  const state = useAppearanceSectionState();
  return (
    <>
      <AppearanceColorModeSection {...state} />
      <SettingsDisplayScaleSection />
      <WorkspaceSurfaceColorSection onEnterPreview={props.onEnterPreview} />
      <WorkspaceDividerSettingsSection />
      <AppearanceReadingColorSection
        appearance={state.appearance}
        safeAccentColor={state.safeAccentColor}
        safeClozeColor={state.safeClozeColor}
        safeFontColor={state.safeFontColor}
        safeHighlightColor={state.safeHighlightColor}
        safeSelectionColor={state.safeSelectionColor}
      />
      <NodeIconSettingsSection onSettingsBackdropTransparentChange={props.onSettingsBackdropTransparentChange} />
      <AppearanceDarkModeContentSection appearance={state.appearance} />
    </>
  );
}
