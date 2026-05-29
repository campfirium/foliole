import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

import { settingsUtilityIconButtonClassName } from '../../../../shared/ui';
import type { NodeIconStateAppearance } from '../../../nodes/components/nodeIconAppearanceSettings';
import { NodeTreeRowIcon } from '../../../nodes/components/NodeTreeRowIcon';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

import { ColorField } from './nodeIconSettingFields';
import type { NodeIconEditTarget } from './NodeIconSettingsDialog';
import { ControlCell, ControlGrid, ControlHeader, NODE_ICON_SETTINGS_TABLE_CLASS } from './NodeIconSettingsRangeGrid';
import { getBaseConfig } from './nodeIconSettingsRowConfig';
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
    <button aria-label={props.label} className="inline-grid size-7 place-items-center rounded-sm text-foreground transition-colors hover:bg-settings-control-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={props.onClick} type="button">
      <NodeTreeRowIcon {...(props.baseOnly !== undefined ? { baseOnly: props.baseOnly } : {})} kind={props.kind} preview state={props.state} />
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

function SettingRow(props: {
  children: ReactNode;
  color: string;
  kind: EditableIconKind;
  onEditShape: () => void;
  onReset: () => void;
  previewState: NodeTreeRowIconState;
  setColor: (value: string) => void;
  title: string;
  baseOnly?: boolean;
  description?: string;
}) {
  return (
    <section aria-label={props.title} className="border-t border-settings-divider/65 px-4 py-2.5 first:border-t-0" data-node-icon-settings-row={props.title}>
      <div className={`grid min-h-8 ${NODE_ICON_SETTINGS_TABLE_CLASS} items-start gap-3`}>
        <MarkerIconButton {...(props.baseOnly !== undefined ? { baseOnly: props.baseOnly } : {})} kind={props.kind} label={`Edit ${props.title} shape`} onClick={props.onEditShape} state={props.previewState} />
        <div className="min-w-0 pt-1">
          <h4 className="truncate text-[0.92rem] font-normal text-foreground/74">{props.title}</h4>
          {props.description ? <p className="truncate text-[0.72rem] leading-4 text-foreground/42">{props.description}</p> : null}
        </div>
        <ColorField compact label={`Color for ${props.title}`} onChange={props.setColor} value={props.color} />
        <div className="col-span-2 min-w-0">{props.children}</div>
        <div className="grid size-7 place-items-center">
          <ResetButton label={`Reset ${props.title}`} onClick={props.onReset} />
        </div>
      </div>
    </section>
  );
}

function PrimaryControls(props: {
  lineWidth: number;
  onLineWidthChange: (value: number) => void;
  onScaleChange: (value: number) => void;
  scale: number;
  children?: ReactNode;
}) {
  return (
    <ControlGrid>
      <ControlCell label="Scale" max={1.8} min={0.45} onChange={props.onScaleChange} value={props.scale} />
      <ControlCell label="Stroke" max={2.4} min={0} onChange={props.onLineWidthChange} value={props.lineWidth} />
      {props.children}
    </ControlGrid>
  );
}

function DoubleLineControls(props: {
  appearance: NodeIconStateAppearance;
  kind: EditableIconKind;
  nodeState: NodeTreeRowIconState;
  state: NodeIconSettingsState;
}) {
  if (props.appearance.effect !== 'double-line') return null;
  return (
    <>
      <ControlCell label="Ring scale" max={1.8} min={0.45} onChange={(value) => props.state.setStateOuterScale(props.nodeState, props.kind, value)} value={props.appearance.outerScale} />
      <ControlCell label="Ring stroke" max={2.4} min={0} onChange={(value) => props.state.setStateOuterLineWidth(props.nodeState, props.kind, value)} value={props.appearance.outerLineWidth} />
    </>
  );
}

function DismissedControls(props: { appearance: NodeIconStateAppearance; kind: EditableIconKind; state: NodeIconSettingsState }) {
  return (
    <div className={`grid ${NODE_ICON_SETTINGS_TABLE_CLASS} items-start gap-3`}>
      <span aria-hidden="true" className="inline-grid size-7 place-items-center text-foreground">
        <NodeTreeRowIcon kind={props.kind} preview state="dismissed" />
      </span>
      <h4 className="min-w-0 truncate pt-1 text-[0.92rem] font-normal text-foreground/74">Topic dismissed</h4>
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
      <div className="grid size-7 place-items-center">
        <ResetButton label="Reset Topic dismissed opacity" onClick={() => props.state.resetStateAppearance('dismissed', props.kind)} />
      </div>
    </div>
  );
}

function OpacityHeader() {
  return (
    <div aria-hidden="true" className={`grid ${NODE_ICON_SETTINGS_TABLE_CLASS} gap-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-foreground/38`}>
      <span />
      <span>Opacity</span>
      <span />
      <span className="text-right">Icon</span>
      <span className="text-right">Row</span>
      <span className="text-center">Reset</span>
    </div>
  );
}

function getStateTitle(kind: EditableIconKind, state: NodeTreeRowIconState) {
  const prefix = kind === 'reading' ? 'Topic' : 'Item';
  if (state === 'pending') return `${prefix} pending`;
  if (state === 'scheduled') return `${prefix} scheduled`;
  return `${prefix} dismissed`;
}

function getBaseTitle(kind: EditableIconKind) {
  return kind === 'reading' ? 'Topic (base)' : 'Item (base)';
}

function BaseRow(props: {
  kind: EditableIconKind;
  onEdit: (target: NodeIconEditTarget) => void;
  onResetBase: (kind: EditableIconKind) => void;
  state: NodeIconSettingsState;
}) {
  const base = getBaseConfig(props.state, props.kind);
  const title = getBaseTitle(props.kind);
  return (
    <SettingRow baseOnly color={base.color} kind={props.kind} onEditShape={() => props.onEdit({ type: 'svg', kind: props.kind, title: `Edit ${title} marker` })} onReset={() => props.onResetBase(props.kind)} previewState="scheduled" setColor={base.setColor} title={title}>
      <PrimaryControls lineWidth={base.lineWidth} onLineWidthChange={base.setLineWidth} onScaleChange={base.setScale} scale={base.scale} />
    </SettingRow>
  );
}

function StateRow(props: {
  kind: EditableIconKind;
  nodeState: NodeTreeRowIconState;
  onEdit: (target: NodeIconEditTarget) => void;
  state: NodeIconSettingsState;
}) {
  const appearance = props.state.stateStyles[props.nodeState][props.kind];
  const title = getStateTitle(props.kind, props.nodeState);
  return (
    <SettingRow
      color={appearance.color}
      kind={props.kind}
      onEditShape={() => props.onEdit({ type: 'state', state: props.nodeState, kind: props.kind, title: `Edit ${title} marker` })}
      onReset={() => props.state.resetStateAppearance(props.nodeState, props.kind)}
      previewState={props.nodeState}
      setColor={(value) => props.state.setStateColor(props.nodeState, props.kind, value)}
      title={title}
      {...(props.nodeState === 'scheduled' ? { description: 'Ring accent' } : {})}
    >
      <PrimaryControls
        lineWidth={appearance.lineWidth}
        onLineWidthChange={(value) => props.state.setStateLineWidth(props.nodeState, props.kind, value)}
        onScaleChange={(value) => props.state.setStateScale(props.nodeState, props.kind, value)}
        scale={appearance.scale}
      >
        <DoubleLineControls appearance={appearance} kind={props.kind} nodeState={props.nodeState} state={props.state} />
      </PrimaryControls>
    </SettingRow>
  );
}

export function NodeIconSettingsRows(props: {
  onEdit: (target: NodeIconEditTarget) => void;
  onResetBase: (kind: EditableIconKind) => void;
  state: NodeIconSettingsState;
}) {
  return (
    <section aria-label="Navigation icon markers" className="w-fit overflow-visible bg-settings-group">
      <ControlHeader />
      <BaseRow kind="reading" onEdit={props.onEdit} onResetBase={props.onResetBase} state={props.state} />
      {(['pending', 'scheduled', 'dismissed'] as const).map((nodeState) => (
        <StateRow key={`reading-${nodeState}`} kind="reading" nodeState={nodeState} onEdit={props.onEdit} state={props.state} />
      ))}
      <BaseRow kind="review" onEdit={props.onEdit} onResetBase={props.onResetBase} state={props.state} />
      {(['pending', 'scheduled'] as const).map((nodeState) => (
        <StateRow key={`review-${nodeState}`} kind="review" nodeState={nodeState} onEdit={props.onEdit} state={props.state} />
      ))}
      <section aria-label="Opacity" className="border-t border-settings-divider/65 px-4 py-3">
        <OpacityHeader />
        <DismissedControls appearance={props.state.stateStyles.dismissed.reading} kind="reading" state={props.state} />
      </section>
    </section>
  );
}
