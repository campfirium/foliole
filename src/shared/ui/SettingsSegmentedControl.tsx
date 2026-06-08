import type { ReactNode } from 'react';

import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow
} from './SettingsLayout';

import { cn } from '@/shared/lib/utils';

export interface SettingsSegmentedOption {
  ariaLabel?: string;
  label: ReactNode;
  value: string;
}

interface SettingsSegmentedControlProps {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  options: SettingsSegmentedOption[];
  value: string;
}

interface SettingsSegmentedRowProps extends Omit<SettingsSegmentedControlProps, 'ariaLabel'> {
  ariaLabel?: string;
  description: ReactNode;
  label: string;
}

export function SettingsSegmentedControl({
  ariaLabel,
  className,
  disabled = false,
  onChange,
  options,
  value
}: SettingsSegmentedControlProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-9 max-w-full items-stretch overflow-hidden rounded-md border border-settings-control-border bg-settings-control text-ui-md transition-colors',
        'hover:border-settings-control-border-hover',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
      role="radiogroup"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            aria-checked={active}
            aria-label={option.ariaLabel}
            className={cn(
              'min-w-0 max-w-[12rem] shrink-0 border-l border-settings-control-border/35 px-3 text-foreground/68 transition-colors first:border-l-0',
              'flex h-full items-center justify-center whitespace-nowrap',
              'hover:bg-settings-control-hover hover:text-foreground',
              'focus-visible:relative focus-visible:z-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
              active && 'bg-settings-segmented-active font-medium text-settings-segmented-active-foreground'
            )}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
            type="button"
          >
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SettingsSegmentedRow(props: SettingsSegmentedRowProps) {
  return (
    <SettingsRow description={props.description} title={props.label}>
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <SettingsSegmentedControl
          ariaLabel={props.ariaLabel ?? props.label}
          {...(props.className !== undefined ? { className: props.className } : {})}
          {...(props.disabled !== undefined ? { disabled: props.disabled } : {})}
          onChange={props.onChange}
          options={props.options}
          value={props.value}
        />
      </SettingsControlSlot>
    </SettingsRow>
  );
}
