import { useState, type FocusEvent } from 'react';

import { parseLiteralUnion } from '../../../../shared/lib/parseLiteralUnion';
import {
  settingsColorSwatchClassName,
  settingsControlValueClassName,
  settingsFieldClassName,
  settingsRangeClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { NODE_ICON_EFFECT_OPTIONS, type NodeIconEffect } from '../../../nodes/components/nodeIconAppearanceSettings';

export function ColorField(props: { compact?: boolean; label: string; onChange: (value: string) => void; value: string }) {
  if (props.compact) {
    return (
      <label className="inline-grid size-7 min-w-0 cursor-pointer place-items-center text-sm text-foreground/72">
        <span className="relative size-5 shrink-0">
          <span aria-hidden="true" className={settingsColorSwatchClassName('pointer-events-none absolute inset-0 !size-5 rounded-sm')} style={{ backgroundColor: props.value }} />
          <input
            aria-label={props.label}
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => props.onChange(event.target.value)}
            type="color"
            value={props.value}
          />
        </span>
      </label>
    );
  }
  return (
    <label className="grid min-w-0 gap-1 text-sm text-foreground/72">
      <span>{props.label}</span>
      <span className="inline-flex h-9 items-center gap-2.5">
        <span className="relative size-9 shrink-0">
          <span aria-hidden="true" className={settingsColorSwatchClassName('pointer-events-none absolute inset-0 rounded-sm')} style={{ backgroundColor: props.value }} />
          <input
            aria-label={props.label}
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => props.onChange(event.target.value)}
            type="color"
            value={props.value}
          />
        </span>
        <span className="text-sm tabular-nums text-foreground/72">{props.value.toUpperCase()}</span>
      </span>
    </label>
  );
}

export function EffectSelect(props: {
  compact?: boolean;
  label: string;
  onChange: (value: NodeIconEffect) => void;
  value: NodeIconEffect;
}) {
  return (
    <label className={props.compact ? 'grid min-w-0 max-w-full gap-1 text-sm text-foreground/72' : 'grid min-w-0 max-w-full gap-1 text-sm text-foreground/72'}>
      <span>{props.label}</span>
      <select
        aria-label={props.label}
        className={settingsFieldClassName('rounded-sm px-2')}
        onChange={(event) => props.onChange(parseLiteralUnion(event.target.value, NODE_ICON_EFFECT_OPTIONS) ?? props.value)}
        value={props.value}
      >
        {NODE_ICON_EFFECT_OPTIONS.map((effect) => (
          <option key={effect} value={effect}>
            {effect === 'none' ? 'None' : 'Double line'}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NumberField(props: {
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm text-foreground/72">
      <span>{props.label}</span>
      <input
        aria-label={props.label}
        className={settingsFieldClassName('rounded-sm px-2 text-center tabular-nums')}
        disabled={props.disabled}
        min={0}
        onChange={(event) => props.onChange(Number(event.target.value))}
        step={props.step}
        type="number"
        value={props.value}
      />
    </label>
  );
}

export function RangeField(props: {
  disabled?: boolean;
  compactLabel?: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setExpanded(false);
  };
  const handleNumberChange = (value: string) => {
    if (value.trim() === '') return;
    props.onChange(Number(value));
  };
  return (
    <div className="relative min-w-0 text-sm text-foreground/72" onBlur={handleBlur} onFocus={() => setExpanded(true)}>
      <div className={props.compactLabel ? 'grid min-h-8 w-[5.2rem] grid-cols-1 items-center' : 'grid min-h-8 w-[8.8rem] grid-cols-[5.2rem_3.2rem] items-center gap-1.5'}>
        {props.compactLabel ? null : <span className="min-w-0 whitespace-nowrap text-foreground/66">{props.label}</span>}
        <input
          aria-label={props.label}
          className={settingsControlValueClassName('h-8 w-[3.2rem] rounded-sm border border-transparent bg-transparent px-1 text-right tabular-nums text-foreground/68 transition-colors hover:border-settings-control-border-hover hover:bg-settings-control-hover focus-visible:border-settings-control-border-hover focus-visible:bg-settings-control-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring')}
          disabled={props.disabled}
          inputMode="decimal"
          max={props.max}
          min={props.min}
          onChange={(event) => handleNumberChange(event.target.value)}
          step={props.step}
          type="text"
          value={props.value.toFixed(2)}
        />
      </div>
      {expanded ? (
        <div className="absolute right-0 top-9 z-20 w-52 rounded-md border border-settings-outline bg-settings-shell px-3 py-2 shadow-settings">
          <input
            aria-label={`${props.label} slider`}
            className={settingsRangeClassName('w-full')}
            disabled={props.disabled}
            max={props.max}
            min={props.min}
            onChange={(event) => props.onChange(Number(event.target.value))}
            step={props.step}
            type="range"
            value={props.value}
          />
        </div>
      ) : null}
    </div>
  );
}

export function SwitchField(props: { checked: boolean; label: string; onChange: (checked: boolean) => void; controlPosition?: 'left' | 'right' }) {
  const control = (
    <button
      aria-checked={props.checked}
      aria-label={props.label}
      className={settingsSwitchClassName(props.checked)}
      onClick={() => props.onChange(!props.checked)}
      role="switch"
      type="button"
    >
      <span aria-hidden="true" className={settingsSwitchKnobClassName(props.checked)} />
    </button>
  );
  return (
    <label className="inline-flex items-center gap-3 text-sm text-foreground/82">
      {props.controlPosition === 'right' ? null : control}
      <span className="whitespace-nowrap">{props.label}</span>
      {props.controlPosition === 'right' ? control : null}
    </label>
  );
}
