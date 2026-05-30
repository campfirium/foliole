import { Pencil, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

import { settingsUtilityIconButtonClassName } from '../../../../shared/ui';
import type { NodeIconStateAppearance } from '../../../nodes/components/nodeIconAppearanceSettings';
import { NodeTreeRowIcon } from '../../../nodes/components/NodeTreeRowIcon';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

import { ColorField } from './nodeIconSettingFields';
import { ControlCell, ControlGrid, NODE_ICON_SETTINGS_TABLE_CLASS, NODE_ICON_SETTINGS_TABLE_GAP_CLASS } from './NodeIconSettingsRangeGrid';
import type { useNodeIconSettingsState } from './nodeIconSettingsState';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;
type NodeIconSettingsState = ReturnType<typeof useNodeIconSettingsState>;

function MarkerIconButton(props: {
  baseOnly?: boolean;
  kind: EditableIconKind;
  label: string;
  onClick: () => void;
  state: NodeTreeRowIconState;
}) {
  return (
    <button aria-label={props.label} className="inline-flex h-8 w-12 items-center justify-center gap-1 rounded-sm bg-transparent text-foreground transition-colors hover:bg-settings-control-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={props.onClick} type="button">
      <NodeTreeRowIcon {...(props.baseOnly !== undefined ? { baseOnly: props.baseOnly } : {})} kind={props.kind} preview state={props.state} />
      <Pencil aria-hidden="true" data-node-icon-edit-affordance="true" size={11} strokeWidth={2} />
    </button>
  );
}

function ResetButton(props: { label: string; onClick: () => void }) {
  return (
    <button aria-label={props.label} className={settingsUtilityIconButtonClassName(false, 'size-7 px-0 text-foreground/42 hover:text-foreground/72')} onClick={props.onClick} type="button">
      <RotateCcw aria-hidden="true" size={16} strokeWidth={1.9} />
    </button>
  );
}

export function SettingRow(props: {
  children: ReactNode;
  color: string;
  kind: EditableIconKind;
  onEditShape: () => void;
  onReset: () => void;
  previewState: NodeTreeRowIconState;
  setColor: (value: string) => void;
  title: string;
  baseOnly?: boolean;
  dividerAfter?: boolean;
  secondaryChildren?: ReactNode;
  secondaryLabel?: string;
}) {
  return (
    <section aria-label={props.title} className="border-t border-settings-divider/65 px-4 py-2.5 first:border-t-0" data-node-icon-settings-row={props.title}>
      <div className={`grid min-h-8 ${NODE_ICON_SETTINGS_TABLE_CLASS} ${NODE_ICON_SETTINGS_TABLE_GAP_CLASS} items-center`}>
        <MarkerIconButton {...(props.baseOnly !== undefined ? { baseOnly: props.baseOnly } : {})} kind={props.kind} label={`Edit ${props.title} shape`} onClick={props.onEditShape} state={props.previewState} />
        <div className="min-w-0">
          <h4 className="truncate text-[0.92rem] font-normal text-foreground/74">{props.title}</h4>
        </div>
        <div className="grid min-w-0 justify-center">
          <ColorField compact label={`Color for ${props.title}`} onChange={props.setColor} value={props.color} />
        </div>
        <div className="col-span-2 min-w-0">{props.children}</div>
        <div className="grid min-w-0 place-items-center">
          <ResetButton label={`Reset ${props.title}`} onClick={props.onReset} />
        </div>
        {props.secondaryLabel && props.secondaryChildren ? (
          <>
            <span aria-hidden="true" />
            <p className="min-w-0 truncate text-[0.72rem] leading-4 text-foreground/42">{props.secondaryLabel}</p>
            <span aria-hidden="true" />
            <div className="col-span-2 min-w-0">{props.secondaryChildren}</div>
            <span aria-hidden="true" />
          </>
        ) : null}
      </div>
    </section>
  );
}

export function PrimaryControls(props: {
  lineWidth: number;
  onLineWidthChange: (value: number) => void;
  onScaleChange: (value: number) => void;
  scale: number;
}) {
  return (
    <ControlGrid>
      <ControlCell label="Scale" max={1.8} min={0.45} onChange={props.onScaleChange} value={props.scale} />
      <ControlCell label="Stroke" max={2.4} min={0} onChange={props.onLineWidthChange} value={props.lineWidth} />
    </ControlGrid>
  );
}

export function DoubleLineControls(props: {
  appearance: NodeIconStateAppearance;
  kind: EditableIconKind;
  nodeState: NodeTreeRowIconState;
  state: NodeIconSettingsState;
}) {
  if (props.appearance.effect !== 'double-line') return null;
  return (
    <>
      <ControlCell label="Inner ring scale" max={1.8} min={0.45} onChange={(value) => props.state.setStateInnerScale(props.nodeState, props.kind, value)} value={props.appearance.innerScale} />
      <ControlCell label="Inner ring stroke" max={2.4} min={0} onChange={(value) => props.state.setStateInnerLineWidth(props.nodeState, props.kind, value)} value={props.appearance.innerLineWidth} />
    </>
  );
}

export function DismissedControls(props: { appearance: NodeIconStateAppearance; kind: EditableIconKind; state: NodeIconSettingsState }) {
  return (
    <div className={`grid ${NODE_ICON_SETTINGS_TABLE_CLASS} ${NODE_ICON_SETTINGS_TABLE_GAP_CLASS} items-center`}>
      <span aria-hidden="true" className="inline-grid size-7 place-items-center text-foreground">
        <NodeTreeRowIcon kind={props.kind} preview state="dismissed" />
      </span>
      <h4 className="min-w-0 truncate text-[0.92rem] font-normal text-foreground/74">Topic (dismissed)</h4>
      <span aria-hidden="true" />
      <ControlCell
        label="Icon opacity"
        max={1}
        min={0}
        onChange={(value) => {
          props.state.setDismissedFadeEnabled(props.kind, true);
          props.state.setDismissedFadeOpacity(props.kind, value);
        }}
        value={props.appearance.fadeOpacity}
      />
      <ControlCell
        label="Row opacity"
        max={1}
        min={0}
        onChange={(value) => {
          props.state.setDismissedFadeEnabled(props.kind, true);
          props.state.setDismissedFadeTextOpacity(props.kind, value);
        }}
        value={props.appearance.fadeTextOpacity}
      />
      <div className="grid min-w-0 place-items-center">
        <ResetButton label="Reset Topic dismissed opacity" onClick={() => props.state.resetStateAppearance('dismissed', props.kind)} />
      </div>
    </div>
  );
}

export function OpacityHeader() {
  return (
    <div aria-hidden="true" className={`grid ${NODE_ICON_SETTINGS_TABLE_CLASS} ${NODE_ICON_SETTINGS_TABLE_GAP_CLASS} pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-foreground/38`}>
      <span />
      <span>Opacity</span>
      <span />
      <span className="text-right">Icon</span>
      <span className="text-right">Row</span>
      <span className="text-center">Reset</span>
    </div>
  );
}
