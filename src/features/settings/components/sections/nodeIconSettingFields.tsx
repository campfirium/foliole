import { NODE_ICON_STROKE_STYLE_OPTIONS, type NodeIconStrokeStyle } from '../../../nodes/components/nodeIconAppearanceSettings';

export function ColorField(props: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="settings-node-icon-color-field">
      <span className="sr-only">{props.label}</span>
      <input
        aria-label={props.label}
        className="settings-node-icon-color-input"
        onChange={(event) => props.onChange(event.target.value)}
        type="color"
        value={props.value}
      />
      <span className="settings-node-icon-color-value">{props.value}</span>
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
    <label className={props.compact ? 'settings-select-wrap settings-select-wrap-compact' : 'settings-select-wrap'}>
      <span className="sr-only">{props.label}</span>
      <select
        aria-label={props.label}
        className="settings-select"
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
    <label className="settings-node-icon-number-field">
      <span className="settings-node-icon-number-label">{props.label}</span>
      <input
        aria-label={props.label}
        className="settings-node-icon-number-input"
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
    <label className="settings-node-icon-checkbox">
      <input checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} type="checkbox" />
      <span>{props.label}</span>
    </label>
  );
}
