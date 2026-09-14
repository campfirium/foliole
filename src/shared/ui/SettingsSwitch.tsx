import type { ButtonHTMLAttributes } from 'react';

import { settingsSwitchClassName, settingsSwitchKnobClassName } from './SettingsLayout';

type SettingsSwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-checked' | 'onChange' | 'onClick' | 'role' | 'type'> & {
  checked: boolean;
  compact?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function SettingsSwitch({ checked, className, compact = false, onCheckedChange, ...props }: SettingsSwitchProps) {
  return (
    <button
      {...props}
      aria-checked={checked}
      className={settingsSwitchClassName(checked, compact ? `h-5 w-9 ${className ?? ''}` : className)}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        aria-hidden="true"
        className={settingsSwitchKnobClassName(
          checked,
          compact ? `size-4 ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}` : undefined
        )}
      />
    </button>
  );
}
