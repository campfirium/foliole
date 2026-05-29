import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  settingsUtilityIconButtonClassName
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

function MarkerIconButton(props: {
  baseOnly?: boolean;
  kind: EditableIconKind;
  label: string;
  onClick: () => void;
  state: NodeTreeRowIconState;
}) {
  return (
    <button aria-label={props.label} className="inline-grid size-8 place-items-center rounded-sm bg-settings-control text-foreground transition-colors hover:bg-settings-control-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={props.onClick} type="button">
      <NodeTreeRowIcon {...(props.baseOnly !== undefined ? { baseOnly: props.baseOnly } : {})} kind={props.kind} preview state={props.state} />
    </button>
  );
}

function ResetButton(props: { label: string; onClick: () => void }) {
  return (
    <button aria-label={props.label} className={settingsUtilityIconButtonClassName(false, 'size-8 px-0 text-foreground/45 hover:text-foreground/78')} onClick={props.onClick} type="button">
      <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
    </button>
  );
}

function RowShell(props: {
  children: ReactNode;
  color: string;
  groupTitle: 'Topic' | 'Item';
  kind: EditableIconKind;
  onEditShape: () => void;
  onReset: () => void;
  previewState: NodeTreeRowIconState;
  setColor: (value: string) => void;
  title: string;
  baseOnly?: boolean;
}) {
  return (
    <section aria-label={`${props.groupTitle} ${props.title}`} className="rounded-sm px-2 py-1.5 transition-colors hover:bg-settings-control-hover/60" data-node-icon-settings-row={`${props.groupTitle} ${props.title}`}>
      <div className="grid min-h-8 grid-cols-[5.5rem_2rem_2rem_20rem_2rem] items-start gap-2.5">
        <h4 className="min-w-0 pt-1 text-[0.88rem] font-normal text-foreground/72">{props.title}</h4>
        <MarkerIconButton {...(props.baseOnly !== undefined ? { baseOnly: props.baseOnly } : {})} kind={props.kind} label={`Edit ${props.groupTitle} ${props.title} shape`} onClick={props.onEditShape} state={props.previewState} />
        <ColorField compact label={`Color for ${props.groupTitle} ${props.title}`} onChange={props.setColor} value={props.color} />
        <div className="min-w-0">{props.children}</div>
        <ResetButton label={`Reset ${props.groupTitle} ${props.title}`} onClick={props.onReset} />
      </div>
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
    <div className="grid w-[20rem] grid-cols-[9rem_9rem] items-start gap-4">
      <RangeField label="Scale" max={1.8} min={0.45} onChange={props.onScaleChange} step={0.05} value={props.scale} />
      <RangeField label="Stroke" max={2.4} min={0} onChange={props.onLineWidthChange} step={0.05} value={props.lineWidth} />
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
    <div className="mt-1 grid w-[20rem] grid-cols-[9rem_9rem] items-start gap-4">
      <RangeField label="Ring scale" max={1.8} min={0.45} onChange={(value) => props.state.setStateOuterScale(props.nodeState, props.kind, value)} step={0.05} value={props.appearance.outerScale} />
      <RangeField label="Ring stroke" max={2.4} min={0} onChange={(value) => props.state.setStateOuterLineWidth(props.nodeState, props.kind, value)} step={0.05} value={props.appearance.outerLineWidth} />
    </div>
  );
}

function DismissedControls(props: { appearance: NodeIconStateAppearance; kind: EditableIconKind; state: NodeIconSettingsState }) {
  return (
    <div className="mt-1 grid w-[20rem] grid-cols-[9rem_10rem] items-start gap-4">
      <RangeField
        label="Opacity"
        max={1}
        min={0}
        onChange={(value) => {
          props.state.setDismissedFadeEnabled(props.kind, true);
          props.state.setDismissedFadeOpacity(props.kind, value);
        }}
        step={0.05}
        value={props.appearance.fadeOpacity}
      />
      <div className="flex min-h-8 w-40 items-center justify-between gap-3">
        <SwitchField checked={props.appearance.fadeWholeRow} controlPosition="right" label="Apply to row" onChange={(value) => props.state.setDismissedFadeWholeRow(props.kind, value)} />
      </div>
    </div>
  );
}

function getStateTitle(state: NodeTreeRowIconState) {
  if (state === 'pending') return 'Pending';
  if (state === 'scheduled') return 'Scheduled';
  return 'Dismissed';
}

export function NodeIconSettingsRows(props: {
  kind: EditableIconKind;
  onEdit: (target: NodeIconEditTarget) => void;
  onResetBase: (kind: EditableIconKind) => void;
  state: NodeIconSettingsState;
  title: 'Topic' | 'Item';
}) {
  const base = getBaseConfig(props.state, props.kind);
  const states = props.kind === 'reading' ? (['pending', 'scheduled', 'dismissed'] as const) : (['pending', 'scheduled'] as const);
  return (
    <section aria-label={`${props.title} markers`} className="rounded-md bg-settings-control/45 px-3 py-3 shadow-[inset_0_0_0_1px_rgb(var(--color-foreground)_/_0.035)]">
      <h3 className="px-2 pb-2 text-[0.9rem] font-semibold text-foreground">{props.title}</h3>
      <div className="grid gap-1 overflow-visible">
        <RowShell baseOnly color={base.color} groupTitle={props.title} kind={props.kind} onEditShape={() => props.onEdit({ type: 'svg', kind: props.kind, title: `Edit ${props.title} Base marker` })} onReset={() => props.onResetBase(props.kind)} previewState="scheduled" setColor={base.setColor} title="Base">
          <PrimaryControls lineWidth={base.lineWidth} onLineWidthChange={base.setLineWidth} onScaleChange={base.setScale} scale={base.scale} />
        </RowShell>
        {states.map((nodeState) => {
          const appearance = props.state.stateStyles[nodeState][props.kind];
          const title = getStateTitle(nodeState);
          return (
            <RowShell
              color={appearance.color}
              groupTitle={props.title}
              kind={props.kind}
              key={nodeState}
              onEditShape={() => props.onEdit({ type: 'state', state: nodeState, kind: props.kind, title: `Edit ${props.title} ${title} marker` })}
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
    </section>
  );
}
