import { ChevronDown, RotateCcw } from 'lucide-react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_COMPOUND_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_RANGE_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SETTINGS_VALUE_WIDTH_CLASS_NAME,
  AppDropdownMenu,
  AppDropdownMenuCheckItem,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuTrigger,
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
  label: string;
  loading?: boolean;
  loadingLabel?: string;
  onChange: (value: string) => void;
  onOpen?: () => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  const selectedLabel = props.options.find((option) => option.value === props.value)?.label ?? props.value;
  return (
    <SettingsRow description={props.description} title={props.label}>
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <AppDropdownMenu onOpenChange={(open) => open && props.onOpen?.()}>
          <AppDropdownMenuTrigger asChild>
            <button aria-label={props.ariaLabel ?? props.label} className={settingsFieldClassName(`${SETTINGS_SELECT_WIDTH_CLASS_NAME} inline-flex items-center justify-between gap-2`)} type="button">
              <span className="truncate">{selectedLabel}</span>
              <ChevronDown aria-hidden="true" className="shrink-0" size={15} strokeWidth={1.8} />
            </button>
          </AppDropdownMenuTrigger>
          <AppDropdownMenuContent align="end" className="max-h-[min(420px,var(--radix-dropdown-menu-content-available-height))] w-[260px] overflow-y-auto">
            {props.options.map((option) => (
              <AppDropdownMenuCheckItem checked={option.value === props.value} key={option.value} onSelect={() => props.onChange(option.value)}>
                {option.label}
              </AppDropdownMenuCheckItem>
            ))}
            {props.loading && props.loadingLabel ? <AppDropdownMenuItem disabled>{props.loadingLabel}</AppDropdownMenuItem> : null}
          </AppDropdownMenuContent>
        </AppDropdownMenu>
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
