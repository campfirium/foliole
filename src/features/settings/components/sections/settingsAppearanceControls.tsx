import { RotateCcw } from 'lucide-react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_RANGE_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SETTINGS_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  settingsControlValueClassName,
  settingsFieldClassName,
  settingsRangeClassName,
  settingsResetButtonClassName
} from '../../../../shared/ui';
import {
  INTERFACE_FONT_SIZE_MAX,
  INTERFACE_FONT_SIZE_MIN
} from '../../model/appearanceSettings';

export function SettingsSelectRow(props: {
  ariaLabel?: string;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <SettingsRow description={props.description} title={props.label}>
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <select aria-label={props.ariaLabel ?? props.label} className={settingsFieldClassName(SETTINGS_SELECT_WIDTH_CLASS_NAME)} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value)} value={props.value}>
          {props.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function FontSizeRow(props: {
  interfaceFontSize: number;
  onInterfaceFontSizeChange: (value: number) => void;
  onInterfaceFontSizeReset: () => void;
}) {
  const t = useTranslation();

  return (
    <SettingsRow description={t('settings.appearance.fontSize.description')} title={t('settings.appearance.fontSize.title')}>
      <SettingsControlSlot className={SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME}>
        <button aria-label={t('settings.appearance.fontSize.reset')} className={settingsResetButtonClassName()} onClick={props.onInterfaceFontSizeReset} type="button">
          <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
        </button>
        <input aria-label={t('settings.appearance.fontSize.aria')} className={settingsRangeClassName(SETTINGS_RANGE_WIDTH_CLASS_NAME)} max={INTERFACE_FONT_SIZE_MAX} min={INTERFACE_FONT_SIZE_MIN} onChange={(event) => props.onInterfaceFontSizeChange(Number(event.target.value))} step={1} type="range" value={props.interfaceFontSize} />
        <span className={settingsControlValueClassName(SETTINGS_VALUE_WIDTH_CLASS_NAME)}>{props.interfaceFontSize}px</span>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
