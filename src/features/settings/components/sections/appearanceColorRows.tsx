import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SettingsColorRow } from '../../../../shared/ui/SettingsColorRow';
import {
  DEFAULT_ACCENT_COLOR_PRESET, DEFAULT_CLOZE_COLOR_PRESET, DEFAULT_FONT_COLOR_PRESET,
  DEFAULT_HIGHLIGHT_COLOR_PRESET, DEFAULT_SELECTION_COLOR_PRESET
} from '../../model/appearanceSettings';

export function AccentColorRow(props: {
  defaultAccentColor: string;
  onAccentColorPresetReset: () => void;
  safeAccentColor: string;
  setAccentColorPreset: (value: string) => void;
}) {
  const t = useTranslation();

  return (
    <SettingsColorRow
      colorInputAriaLabel={t('settings.appearance.accent.picker')}
      defaultValue={props.defaultAccentColor || DEFAULT_ACCENT_COLOR_PRESET}
      description={t('settings.appearance.accent.description')}
      onChange={props.setAccentColorPreset}
      onReset={props.onAccentColorPresetReset}
      resetButtonAriaLabel={t('settings.appearance.accent.reset')}
      title={t('settings.appearance.accent.title')}
      value={props.safeAccentColor}
    />
  );
}

export function FontColorRow(props: {
  defaultFontColor: string;
  onFontColorPresetReset: () => void;
  safeFontColor: string;
  setFontColorPreset: (value: string) => void;
}) {
  const t = useTranslation();

  return (
    <SettingsColorRow
      colorInputAriaLabel={t('settings.appearance.fontColor.picker')}
      defaultValue={props.defaultFontColor || DEFAULT_FONT_COLOR_PRESET}
      description={t('settings.appearance.fontColor.description')}
      onChange={props.setFontColorPreset}
      onReset={props.onFontColorPresetReset}
      resetButtonAriaLabel={t('settings.appearance.fontColor.reset')}
      title={t('settings.appearance.fontColor.title')}
      value={props.safeFontColor}
    />
  );
}

export function HighlightColorRow(props: {
  defaultHighlightColor: string;
  onHighlightColorPresetReset: () => void;
  safeHighlightColor: string;
  setHighlightColorPreset: (value: string) => void;
}) {
  const t = useTranslation();

  return (
    <SettingsColorRow
      colorInputAriaLabel={t('settings.appearance.highlightColor.picker')}
      defaultValue={props.defaultHighlightColor || DEFAULT_HIGHLIGHT_COLOR_PRESET}
      description={t('settings.appearance.highlightColor.description')}
      onChange={props.setHighlightColorPreset}
      onReset={props.onHighlightColorPresetReset}
      resetButtonAriaLabel={t('settings.appearance.highlightColor.reset')}
      title={t('settings.appearance.highlightColor.title')}
      value={props.safeHighlightColor}
    />
  );
}

export function SelectionColorRow(props: {
  defaultSelectionColor: string;
  onSelectionColorPresetReset: () => void;
  safeSelectionColor: string;
  setSelectionColorPreset: (value: string) => void;
}) {
  const t = useTranslation();

  return (
    <SettingsColorRow
      colorInputAriaLabel={t('settings.appearance.selectionColor.picker')}
      defaultValue={props.defaultSelectionColor || DEFAULT_SELECTION_COLOR_PRESET}
      description={t('settings.appearance.selectionColor.description')}
      onChange={props.setSelectionColorPreset}
      onReset={props.onSelectionColorPresetReset}
      resetButtonAriaLabel={t('settings.appearance.selectionColor.reset')}
      title={t('settings.appearance.selectionColor.title')}
      value={props.safeSelectionColor}
    />
  );
}

export function ClozeColorRow(props: {
  defaultClozeColor: string;
  onClozeColorPresetReset: () => void;
  safeClozeColor: string;
  setClozeColorPreset: (value: string) => void;
}) {
  const t = useTranslation();

  return (
    <SettingsColorRow
      colorInputAriaLabel={t('settings.appearance.clozeColor.picker')}
      defaultValue={props.defaultClozeColor || DEFAULT_CLOZE_COLOR_PRESET}
      description={t('settings.appearance.clozeColor.description')}
      onChange={props.setClozeColorPreset}
      onReset={props.onClozeColorPresetReset}
      resetButtonAriaLabel={t('settings.appearance.clozeColor.reset')}
      title={t('settings.appearance.clozeColor.title')}
      value={props.safeClozeColor}
    />
  );
}
