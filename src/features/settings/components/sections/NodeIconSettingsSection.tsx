import { Pencil, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

import {
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsResetButtonClassName,
  settingsUtilityIconButtonClassName
} from '../../../../shared/ui';
import { NodeTreeRowIcon } from '../../../nodes/components/NodeTreeRowIcon';
import type { NodeTreeRowIconKind, NodeTreeRowIconState } from '../../../nodes/components/NodeTreeRowIconModel';

import { NodeIconSettingsDialog, type NodeIconEditTarget } from './NodeIconSettingsDialog';
import { useNodeIconSettingsState } from './nodeIconSettingsState';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;

function PreviewIcon(props: { baseOnly?: boolean; kind: EditableIconKind; state: NodeTreeRowIconState }) {
  return (
    <span className="inline-flex size-9 items-center justify-center text-foreground">
      <NodeTreeRowIcon baseOnly={props.baseOnly} kind={props.kind} preview state={props.state} />
    </span>
  );
}

function CompactConfigRow(props: {
  actionLabel?: string;
  label: string;
  onEdit: () => void;
  onReset: () => void;
  preview: ReactNode;
}) {
  const actionLabel = props.actionLabel ?? props.label;
  return (
    <SettingsRow className="min-h-14" title={props.label}>
      <SettingsControlSlot className="flex-[0_0_156px]">
        <button aria-label={`Reset ${actionLabel}`} className={settingsResetButtonClassName()} onClick={props.onReset} type="button">
          <RotateCcw aria-hidden="true" size={18} strokeWidth={1.9} />
        </button>
        {props.preview}
        <button aria-label={`Edit ${actionLabel}`} className={settingsUtilityIconButtonClassName()} onClick={props.onEdit} type="button">
          <Pencil aria-hidden="true" size={18} strokeWidth={1.9} />
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function IconColumn(props: {
  kind: EditableIconKind;
  onEdit: (target: NodeIconEditTarget) => void;
  onResetState: (iconState: NodeTreeRowIconState, kind: EditableIconKind) => void;
  state: ReturnType<typeof useNodeIconSettingsState>;
  title: 'Topic' | 'Item';
}) {
  const isTopic = props.kind === 'reading';
  return (
    <div className="[&>[data-settings-row]+[data-settings-row]]:before:block">
      <CompactConfigRow
        label={`${props.title} icon`}
        onEdit={() => props.onEdit({ type: 'svg', kind: props.kind, title: `Edit ${props.title} icon` })}
        onReset={() => {
          if (isTopic) {
            props.state.setTopicIcon('');
            props.state.setTopicSvg('');
            props.state.setTopicColor('#202124');
            props.state.setTopicLineWidth(1.2);
            props.state.setTopicScale(1);
          } else {
            props.state.setItemIcon('');
            props.state.setItemSvg('');
            props.state.setItemColor('#202124');
            props.state.setItemLineWidth(1.2);
            props.state.setItemScale(1);
          }
        }}
        preview={<PreviewIcon baseOnly kind={props.kind} state="scheduled" />}
      />
      {(['pending', 'scheduled', 'dismissed'] as const).map((iconState) => (
        <CompactConfigRow
          actionLabel={`${props.title} ${iconState}`}
          key={iconState}
          label={`${props.title} (${iconState})`}
          onEdit={() => props.onEdit({ type: 'state', state: iconState, kind: props.kind, title: `Edit ${props.title} ${iconState}` })}
          onReset={() => props.onResetState(iconState, props.kind)}
          preview={<PreviewIcon kind={props.kind} state={iconState} />}
        />
      ))}
    </div>
  );
}

type NodeIconSettingsState = ReturnType<typeof useNodeIconSettingsState>;

function resetAppearance(state: NodeIconSettingsState, iconState: NodeTreeRowIconState, kind: EditableIconKind) {
  state.resetStateAppearance(iconState, kind);
}

function resetEditTarget(state: NodeIconSettingsState, target: NodeIconEditTarget) {
  if (target.type === 'svg') {
    if (target.kind === 'reading') {
      state.setTopicIcon('');
      state.setTopicSvg('');
    } else {
      state.setItemIcon('');
      state.setItemSvg('');
    }
    return;
  }
  resetAppearance(state, target.state, target.kind);
}

export function NodeIconSettingsSection() {
  const state = useNodeIconSettingsState();
  const [editTarget, setEditTarget] = useState<NodeIconEditTarget | null>(null);
  const [iconQuery, setIconQuery] = useState('');

  return (
    <SettingsSection ariaLabel="Navigation icon settings section" title="Navigation icons">
      <div className="grid grid-cols-2 gap-px max-[900px]:grid-cols-1">
        <IconColumn kind="reading" onEdit={setEditTarget} onResetState={(iconState, kind) => resetAppearance(state, iconState, kind)} state={state} title="Topic" />
        <IconColumn kind="review" onEdit={setEditTarget} onResetState={(iconState, kind) => resetAppearance(state, iconState, kind)} state={state} title="Item" />
      </div>
      <NodeIconSettingsDialog
        editTarget={editTarget}
        iconQuery={iconQuery}
        onClose={() => {
          setEditTarget(null);
          setIconQuery('');
        }}
        onIconQueryChange={setIconQuery}
        onReset={(target) => resetEditTarget(state, target)}
        state={state}
      />
    </SettingsSection>
  );
}
