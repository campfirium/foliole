import { Minus, Plus } from 'lucide-react';

import { useTranslation } from '@/shared/localization/LocalizationProvider';

export function CompanionReadingNumberControl(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange(value: number): void;
}) {
  const t = useTranslation();
  const change = (direction: number) => props.onChange(
    Number(Math.min(props.max, Math.max(props.min, (direction > 0
      ? Math.floor(props.value / props.step + 1e-8) + 1
      : Math.ceil(props.value / props.step - 1e-8) - 1) * props.step)).toFixed(2))
  );
  const buttonClass = 'flex min-h-11 min-w-11 items-center justify-center rounded-md text-foreground '
    + 'active:bg-companion-subtle/80 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 '
    + 'focus-visible:outline-companion-accent';
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b border-companion-divider py-2">
      <span className="text-sm font-medium text-foreground">{props.label}</span>
      <div className="flex shrink-0 items-center gap-2">
        <output aria-label={props.label} aria-live="polite" className="min-w-12 text-right text-sm tabular-nums text-companion-text-secondary">
          {props.value}{props.unit}
        </output>
        <div className="flex divide-x divide-companion-divider rounded-md border border-companion-divider">
          <button aria-label={t('companion.reading.font.decrease', { setting: props.label })}
            className={buttonClass} disabled={props.value <= props.min} onClick={() => change(-1)} type="button">
            <Minus aria-hidden="true" size={16} />
          </button>
          <button aria-label={t('companion.reading.font.increase', { setting: props.label })}
            className={buttonClass} disabled={props.value >= props.max} onClick={() => change(1)} type="button">
            <Plus aria-hidden="true" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
