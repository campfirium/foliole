import { useEffect, useState } from 'react';

import {
  DEFAULT_NODE_ICON_BASE_APPEARANCE
} from '../../../nodes/components/nodeIconAppearanceSettings';
import type { NodeTreeRowIconKind } from '../../../nodes/components/NodeTreeRowIconModel';

import { NodeIconSettingsDialog, type NodeIconEditTarget } from './NodeIconSettingsDialog';
import { NodeIconSettingsEditorDialog } from './NodeIconSettingsEditorDialog';
import { NodeIconSettingsOverview } from './NodeIconSettingsOverview';
import { useNodeIconSettingsState } from './nodeIconSettingsState';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;

function resetBase(state: ReturnType<typeof useNodeIconSettingsState>, kind: EditableIconKind) {
  if (kind === 'reading') {
    state.setTopicIcon('');
    state.setTopicSvg('');
    state.setTopicColor(DEFAULT_NODE_ICON_BASE_APPEARANCE.color);
    state.setTopicLineWidth(DEFAULT_NODE_ICON_BASE_APPEARANCE.lineWidth);
    state.setTopicScale(DEFAULT_NODE_ICON_BASE_APPEARANCE.scale);
    return;
  }
  state.setItemIcon('');
  state.setItemSvg('');
  state.setItemColor(DEFAULT_NODE_ICON_BASE_APPEARANCE.color);
  state.setItemLineWidth(DEFAULT_NODE_ICON_BASE_APPEARANCE.lineWidth);
  state.setItemScale(DEFAULT_NODE_ICON_BASE_APPEARANCE.scale);
}

function resetEditTarget(state: ReturnType<typeof useNodeIconSettingsState>, target: NodeIconEditTarget) {
  if (target.type === 'svg') {
    resetBase(state, target.kind);
    return;
  }
  state.setStateSvg(target.state, target.kind, '');
}

export function NodeIconSettingsSection(props: {
  onSettingsBackdropTransparentChange: (value: boolean) => void;
}) {
  const { onSettingsBackdropTransparentChange } = props;
  const state = useNodeIconSettingsState();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<NodeIconEditTarget | null>(null);
  const [iconQuery, setIconQuery] = useState('');

  useEffect(() => {
    onSettingsBackdropTransparentChange(editorOpen);
    return () => onSettingsBackdropTransparentChange(false);
  }, [editorOpen, onSettingsBackdropTransparentChange]);

  return (
    <section aria-label="Navigation icon settings section" className="mb-8 last:mb-0">
      <div className="overflow-hidden rounded-md bg-settings-group">
        <NodeIconSettingsOverview onEdit={() => setEditorOpen(true)} />
      </div>
      <NodeIconSettingsEditorDialog
        onClose={() => setEditorOpen(false)}
        onEditShape={setEditTarget}
        onResetBase={(kind) => resetBase(state, kind)}
        open={editorOpen}
        state={state}
      />
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
    </section>
  );
}
