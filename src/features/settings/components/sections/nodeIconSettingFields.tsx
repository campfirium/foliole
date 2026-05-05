import { AppInput } from '../../../../shared/ui';
import { NODE_ICON_STROKE_STYLE_OPTIONS, type NodeIconStrokeStyle } from '../../../nodes/components/nodeIconAppearanceSettings';

const SETTINGS_SELECT_CLASS_NAME =
  'w-full min-w-0 rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm text-foreground';

export function ColorField(props: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border bg-bg-elevated px-2.5 py-1 text-foreground">
      <span className="sr-only">{props.label}</span>
      <input
        aria-label={props.label}
        className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
        onChange={(event) => props.onChange(event.target.value)}
        type="color"
        value={props.value}
      />
      <span className="text-[0.84rem] tabular-nums text-foreground/70">{props.value}</span>
    </label>
  );
}

export function StrokeStyleSelect(props: {
  compact?: boolean;
  label: string;
  onChange: (value: NodeIconStrokeStyle) => void;
  value: NodeIconStrokeStyle;
}) {
  return (
    <label className={props.compact ? 'inline-flex w-[132px] max-w-full flex-none' : 'inline-flex max-w-full flex-1'}>
      <span className="sr-only">{props.label}</span>
      <select
        aria-label={props.label}
        className={SETTINGS_SELECT_CLASS_NAME}
        onChange={(event) => props.onChange(event.target.value as NodeIconStrokeStyle)}
        value={props.value}
      >
        {NODE_ICON_STROKE_STYLE_OPTIONS.map((strokeStyle) => (
          <option key={strokeStyle} value={strokeStyle}>
            {strokeStyle}
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
    <label className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border bg-bg-elevated px-2.5 py-1 text-foreground">
      <span className="text-[0.84rem] text-foreground/70">{props.label}</span>
      <AppInput
        aria-label={props.label}
        className="h-auto min-h-0 min-w-[72px] border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
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

export function CheckboxField(props: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-foreground">
      <input
        checked={props.checked}
        className="h-4 w-4 rounded border border-border"
        onChange={(event) => props.onChange(event.target.checked)}
        type="checkbox"
      />
      <span>{props.label}</span>
    </label>
  );
}
