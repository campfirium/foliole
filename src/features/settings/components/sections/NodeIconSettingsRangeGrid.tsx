import type { ReactNode } from 'react';

import { RangeField } from './nodeIconSettingFields';

export const NODE_ICON_SETTINGS_TABLE_CLASS = 'grid-cols-[2rem_7.2rem_2.4rem_5.2rem_5.2rem_6.2rem]';
export const NODE_ICON_SETTINGS_TABLE_GAP_CLASS = 'gap-x-2.5';

export function ControlHeader() {
  return (
    <div aria-hidden="true" className={`grid ${NODE_ICON_SETTINGS_TABLE_CLASS} ${NODE_ICON_SETTINGS_TABLE_GAP_CLASS} px-4 pb-1 pt-3 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-foreground/38`}>
      <span />
      <span>Icon</span>
      <span>Color</span>
      <span className="text-right">Scale</span>
      <span className="text-right">Stroke</span>
      <span className="text-center">Reset</span>
    </div>
  );
}

export function ControlCell(props: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[5.2rem] items-center">
      <RangeField compactLabel label={props.label} max={props.max} min={props.min} onChange={props.onChange} step={0.05} value={props.value} />
    </div>
  );
}

export function EmptyCell() {
  return <span aria-hidden="true" />;
}

export function ControlGrid(props: { children: ReactNode }) {
  return <div className="grid min-w-0 grid-cols-[5.2rem_5.2rem] items-start gap-x-3 gap-y-1.5">{props.children}</div>;
}
