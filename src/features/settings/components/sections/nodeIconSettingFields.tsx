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

export function ColorField(props: { label: string; onChange: (value: string) => void; value: string }) {
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
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="grid min-w-0 max-w-60 gap-1.5 text-sm text-foreground/72">
      <span className="flex items-center justify-between gap-3">
        <span>{props.label}</span>
        <span className={settingsControlValueClassName('tabular-nums')}>{props.value.toFixed(2)}</span>
      </span>
      <input
        aria-label={props.label}
        className={settingsRangeClassName('w-full')}
        disabled={props.disabled}
        max={props.max}
        min={props.min}
        onChange={(event) => props.onChange(Number(event.target.value))}
        step={props.step}
        type="range"
        value={props.value}
      />
    </label>
  );
}

export function SwitchField(props: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-3 text-sm text-foreground/82">
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
      <span>{props.label}</span>
    </label>
  );
}
