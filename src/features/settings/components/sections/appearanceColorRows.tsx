import { RotateCcw } from 'lucide-react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  settingsColorSwatchClassName,
  settingsFieldClassName,
  settingsResetButtonClassName
} from '../../../../shared/ui';
import {
  DEFAULT_ACCENT_COLOR_PRESET,
  DEFAULT_CLOZE_COLOR_PRESET,
  DEFAULT_FONT_COLOR_PRESET,
  DEFAULT_HIGHLIGHT_COLOR_PRESET,
  DEFAULT_SELECTION_COLOR_PRESET
} from '../../model/appearanceSettings';

function ColorSettingRow(props: {
  colorInputAriaLabel: string;
  defaultValue: string;
  description: string;
  onChange: (value: string) => void;
  onReset: () => void;
  resetButtonAriaLabel: string;
  title: string;
  value: string;
}) {
  const t = useTranslation();

  return (
    <SettingsRow description={props.description} title={props.title}>
      <SettingsControlSlot className={SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME}>
        <button aria-label={props.resetButtonAriaLabel} className={settingsResetButtonClassName('disabled:cursor-default disabled:opacity-45')} disabled={props.value === props.defaultValue} onClick={props.onReset} type="button">
          <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
        </button>
        <div className="inline-flex min-h-9 items-center gap-2.5">
          <label className="relative h-9 w-9 shrink-0">
            <span
              aria-hidden="true"
              className={settingsColorSwatchClassName('pointer-events-none absolute inset-0')}
              style={{ backgroundColor: props.value }}
            />
            <input
              aria-label={props.colorInputAriaLabel}
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(event) => props.onChange(event.target.value)}
              type="color"
              value={props.value}
            />
          </label>
          <label className="shrink-0 text-sm text-foreground/72">
            <input
              aria-label={t('settings.appearance.colors.hexValue', { title: props.title })}
              className={settingsFieldClassName(`${SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME} tabular-nums`)}
              onChange={(event) => props.onChange(event.target.value)}
              spellCheck={false}
              value={props.value.toUpperCase()}
            />
          </label>
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function AccentColorRow(props: {
  defaultAccentColor: string;
  onAccentColorPresetReset: () => void;
  safeAccentColor: string;
  setAccentColorPreset: (value: string) => void;
}) {
  const t = useTranslation();

  return (
    <ColorSettingRow
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
    <ColorSettingRow
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
    <ColorSettingRow
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
    <ColorSettingRow
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
    <ColorSettingRow
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
