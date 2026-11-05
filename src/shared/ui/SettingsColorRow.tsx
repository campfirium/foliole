import { RotateCcw } from 'lucide-react';

import { useTranslation } from '../localization/LocalizationProvider';

import {
  SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME, SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME,
  SettingsControlSlot, SettingsRow, settingsColorSwatchClassName, settingsFieldClassName,
  settingsResetButtonClassName
} from './index';

export function SettingsColorRow(props: {
  colorInputAriaLabel: string;
  compact?: boolean;
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
    <SettingsRow data-settings-color-row controlLayout={props.compact ? 'inline' : 'stacked'}
      description={props.compact ? undefined : props.description} title={props.title}>
      <SettingsControlSlot className={props.compact ? '' : SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME}>
        <button aria-label={props.resetButtonAriaLabel} className={settingsResetButtonClassName('disabled:cursor-default disabled:opacity-45')} disabled={props.value === props.defaultValue} onClick={props.onReset} type="button">
          <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
        </button>
        <div className="inline-flex min-h-9 items-center gap-2.5">
          <label data-settings-color-swatch className="relative h-9 w-9 shrink-0">
            <span
              aria-hidden="true"
              className={settingsColorSwatchClassName(props.compact
                ? 'pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2'
                : 'pointer-events-none absolute inset-0')}
              style={{ backgroundColor: props.value }}
            />
            <input
              aria-label={props.colorInputAriaLabel}
              className="absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0"
              onChange={(event) => props.onChange(event.target.value)}
              type="color"
              value={props.value}
            />
          </label>
          {!props.compact ? <label className="shrink-0 text-sm text-foreground/72">
            <input
              aria-label={t('settings.appearance.colors.hexValue', { title: props.title })}
              className={settingsFieldClassName(`${SETTINGS_INPUT_VALUE_WIDTH_CLASS_NAME} tabular-nums`)}
              onChange={(event) => props.onChange(event.target.value)}
              spellCheck={false}
              value={props.value.toUpperCase()}
            />
          </label> : null}
        </div>
      </SettingsControlSlot>
    </SettingsRow>
  );
}
