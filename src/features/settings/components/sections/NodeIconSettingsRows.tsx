import { Pencil, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  settingsButtonClassName,
  settingsResetButtonClassName
} from '../../../../shared/ui';
import type { NodeIconStateAppearance } from '../../../nodes/components/nodeIconAppearanceSettings';
import { NodeTreeRowIcon } from '../../../nodes/components/NodeTreeRowIcon';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

import { ColorField, RangeField, SwitchField } from './nodeIconSettingFields';
import type { NodeIconEditTarget } from './NodeIconSettingsDialog';
import type { useNodeIconSettingsState } from './nodeIconSettingsState';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;
type NodeIconSettingsState = ReturnType<typeof useNodeIconSettingsState>;

type BaseRowConfig = {
  color: string;
  lineWidth: number;
  scale: number;
  setColor: (value: string) => void;
  setLineWidth: (value: number) => void;
  setScale: (value: number) => void;
};

function getBaseConfig(state: NodeIconSettingsState, kind: EditableIconKind): BaseRowConfig {
  return kind === 'reading'
    ? {
        color: state.topicColor,
        lineWidth: state.topicLineWidth,
        scale: state.topicScale,
        setColor: state.setTopicColor,
        setLineWidth: state.setTopicLineWidth,
        setScale: state.setTopicScale
      }
    : {
        color: state.itemColor,
        lineWidth: state.itemLineWidth,
        scale: state.itemScale,
        setColor: state.setItemColor,
        setLineWidth: state.setItemLineWidth,
        setScale: state.setItemScale
      };
}

function IconPreview(props: { baseOnly?: boolean; kind: EditableIconKind; state: NodeTreeRowIconState }) {
  return (
    <span className="inline-grid size-10 place-items-center rounded-md bg-settings-control text-foreground">
      <NodeTreeRowIcon {...(props.baseOnly !== undefined ? { baseOnly: props.baseOnly } : {})} kind={props.kind} preview state={props.state} />
    </span>
  );
}

function ShapeButton(props: { label: string; onClick: () => void }) {
  return (
    <button aria-label={props.label} className={settingsButtonClassName('size-8 px-0')} onClick={props.onClick} type="button">
      <Pencil aria-hidden="true" size={16} strokeWidth={1.9} />
    </button>
  );
}

function RowShell(props: {
  children: ReactNode;
  color: string;
  kind: EditableIconKind;
  onEditShape: () => void;
  onReset: () => void;
  previewState: NodeTreeRowIconState;
  setColor: (value: string) => void;
  title: string;
  baseOnly?: boolean;
}) {
  return (
    <section className="grid grid-cols-[12rem_minmax(0,1fr)] border-t border-settings-divider/55 first:border-t-0 max-[980px]:grid-cols-1" data-node-icon-settings-row={props.title}>
      <div className="grid content-start gap-3 py-4 pr-5 max-[980px]:pb-0 max-[980px]:pr-0">
        <div className="flex items-center justify-between gap-3">
          <h4 className="min-w-0 text-[0.95rem] font-medium text-foreground">{props.title}</h4>
          <button aria-label={`Reset ${props.title}`} className={settingsResetButtonClassName('size-8')} onClick={props.onReset} type="button">
            <RotateCcw aria-hidden="true" size={16} strokeWidth={1.9} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <IconPreview {...(props.baseOnly !== undefined ? { baseOnly: props.baseOnly } : {})} kind={props.kind} state={props.previewState} />
          <ShapeButton label={`Edit ${props.title} shape`} onClick={props.onEditShape} />
        </div>
        <ColorField label="Color" onChange={props.setColor} value={props.color} />
      </div>
      <div className="grid content-start gap-4 py-4 pl-5 max-[980px]:pl-0">{props.children}</div>
    </section>
  );
}

function PrimaryControls(props: {
  lineWidth: number;
  onLineWidthChange: (value: number) => void;
  onScaleChange: (value: number) => void;
  scale: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 max-[760px]:grid-cols-1">
      <RangeField label="Scale" max={1.8} min={0.45} onChange={props.onScaleChange} step={0.05} value={props.scale} />
      <RangeField label="Line width" max={2.4} min={0} onChange={props.onLineWidthChange} step={0.05} value={props.lineWidth} />
    </div>
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
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 max-[760px]:grid-cols-1">
      <RangeField label="Outer scale" max={1.8} min={0.45} onChange={(value) => props.state.setStateOuterScale(props.nodeState, props.kind, value)} step={0.05} value={props.appearance.outerScale} />
      <RangeField label="Outer width" max={2.4} min={0} onChange={(value) => props.state.setStateOuterLineWidth(props.nodeState, props.kind, value)} step={0.05} value={props.appearance.outerLineWidth} />
      <RangeField label="Inner scale" max={1.8} min={0.45} onChange={(value) => props.state.setStateInnerScale(props.nodeState, props.kind, value)} step={0.05} value={props.appearance.innerScale} />
      <RangeField label="Inner width" max={2.4} min={0} onChange={(value) => props.state.setStateInnerLineWidth(props.nodeState, props.kind, value)} step={0.05} value={props.appearance.innerLineWidth} />
    </div>
  );
}

function DismissedControls(props: { appearance: NodeIconStateAppearance; kind: EditableIconKind; state: NodeIconSettingsState }) {
  return (
    <div className="grid grid-cols-2 items-end gap-x-6 gap-y-4 max-[760px]:grid-cols-1">
      <SwitchField checked={props.appearance.fadeEnabled} label="Muted dismissed row" onChange={(value) => props.state.setDismissedFadeEnabled(props.kind, value)} />
      {props.appearance.fadeEnabled ? (
        <>
          <RangeField label="Fade opacity" max={1} min={0} onChange={(value) => props.state.setDismissedFadeOpacity(props.kind, value)} step={0.05} value={props.appearance.fadeOpacity} />
          <SwitchField checked={props.appearance.fadeWholeRow} label="Apply to whole row" onChange={(value) => props.state.setDismissedFadeWholeRow(props.kind, value)} />
        </>
      ) : null}
    </div>
  );
}

export function NodeIconSettingsRows(props: {
  kind: EditableIconKind;
  onEdit: (target: NodeIconEditTarget) => void;
  onResetBase: (kind: EditableIconKind) => void;
  state: NodeIconSettingsState;
  title: 'Topic' | 'Item';
}) {
  const base = getBaseConfig(props.state, props.kind);
  return (
    <div>
      <RowShell baseOnly color={base.color} kind={props.kind} onEditShape={() => props.onEdit({ type: 'svg', kind: props.kind, title: `Edit ${props.title} icon` })} onReset={() => props.onResetBase(props.kind)} previewState="scheduled" setColor={base.setColor} title={`${props.title} icon`}>
        <PrimaryControls lineWidth={base.lineWidth} onLineWidthChange={base.setLineWidth} onScaleChange={base.setScale} scale={base.scale} />
      </RowShell>
      {(['pending', 'scheduled', 'dismissed'] as const).map((nodeState) => {
        const appearance = props.state.stateStyles[nodeState][props.kind];
        const title = `${props.title} ${nodeState}`;
        return (
          <RowShell
            color={appearance.color}
            kind={props.kind}
            key={nodeState}
            onEditShape={() => props.onEdit({ type: 'state', state: nodeState, kind: props.kind, title: `Edit ${title}` })}
            onReset={() => props.state.resetStateAppearance(nodeState, props.kind)}
            previewState={nodeState}
            setColor={(value) => props.state.setStateColor(nodeState, props.kind, value)}
            title={title}
          >
            <PrimaryControls
              lineWidth={appearance.lineWidth}
              onLineWidthChange={(value) => props.state.setStateLineWidth(nodeState, props.kind, value)}
              onScaleChange={(value) => props.state.setStateScale(nodeState, props.kind, value)}
              scale={appearance.scale}
            />
            <DoubleLineControls appearance={appearance} kind={props.kind} nodeState={nodeState} state={props.state} />
            {nodeState === 'dismissed' ? <DismissedControls appearance={appearance} kind={props.kind} state={props.state} /> : null}
          </RowShell>
        );
      })}
    </div>
  );
}
